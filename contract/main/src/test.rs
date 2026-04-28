#![cfg(test)]

use super::{Error, MainContract, MainContractClient, Status};
use receipt_token::{ReceiptToken, ReceiptTokenClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

struct Ctx<'a> {
    env: Env,
    main: MainContractClient<'a>,
    receipt: ReceiptTokenClient<'a>,
    token: TokenClient<'a>,
    asset_admin: StellarAssetClient<'a>,
}

fn setup<'a>() -> Ctx<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac.address();

    let placeholder = Address::generate(&env);
    let receipt_id = env.register(ReceiptToken, (placeholder,));

    let main_id = env.register(MainContract, (receipt_id.clone(), token_id.clone()));

    let receipt = ReceiptTokenClient::new(&env, &receipt_id);
    receipt.set_admin(&main_id);

    env.ledger().with_mut(|l| l.timestamp = 1_000);

    Ctx {
        main: MainContractClient::new(&env, &main_id),
        receipt,
        token: TokenClient::new(&env, &token_id),
        asset_admin: StellarAssetClient::new(&env, &token_id),
        env,
    }
}

fn fund(ctx: &Ctx, who: &Address, amount: i128) {
    ctx.asset_admin.mint(who, &amount);
}

fn open_campaign<'a>(ctx: &Ctx<'a>, creator: &Address, beneficiary: &Address, goal: i128, deadline: u64) -> u32 {
    ctx.main.create_campaign(
        creator,
        beneficiary,
        &String::from_str(&ctx.env, "Print run"),
        &goal,
        &deadline,
    )
}

#[test]
fn pledge_increases_total_and_mints_badge() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    ctx.main.pledge(&backer, &id, &30_000_000);

    let c = ctx.main.campaign(&id);
    assert_eq!(c.pledged, 30_000_000);
    assert_eq!(c.backers, 1);
    assert_eq!(ctx.main.pledged_by(&id, &backer), 30_000_000);
    assert_eq!(ctx.token.balance(&backer), 70_000_000);
    assert_eq!(ctx.receipt.balance(&backer), 1);
    assert_eq!(ctx.receipt.total_supply(), 1);
}

#[test]
fn multiple_pledges_accumulate() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 100_000_000);
    fund(&ctx, &bob, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 100_000_000, 2_000);
    ctx.main.pledge(&alice, &id, &30_000_000);
    ctx.main.pledge(&bob, &id, &50_000_000);
    ctx.main.pledge(&alice, &id, &20_000_000);

    let c = ctx.main.campaign(&id);
    assert_eq!(c.pledged, 100_000_000);
    assert_eq!(c.backers, 2);
    assert_eq!(ctx.main.pledged_by(&id, &alice), 50_000_000);
    assert_eq!(ctx.main.pledged_by(&id, &bob), 50_000_000);
    assert_eq!(ctx.receipt.balance(&alice), 2);
    assert_eq!(ctx.receipt.balance(&bob), 1);
    assert_eq!(ctx.receipt.total_supply(), 3);
}

#[test]
fn claim_pays_beneficiary_when_goal_met() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let beneficiary = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &beneficiary, 50_000_000, 2_000);
    // pledge exactly to the goal - last accepted pledge that fills the bucket
    ctx.main.pledge(&backer, &id, &50_000_000);

    // beneficiary can claim immediately, no need to wait for deadline
    ctx.main.claim(&id);

    assert_eq!(ctx.token.balance(&beneficiary), 50_000_000);
    let c = ctx.main.campaign(&id);
    assert!(matches!(c.status, Status::Funded));

    let second = ctx.main.try_claim(&id);
    assert!(matches!(second, Err(Ok(Error::AlreadyClaimed))));
}

#[test]
fn cannot_pledge_when_goal_already_met() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 100_000_000);
    fund(&ctx, &bob, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    // alice fills the goal exactly
    ctx.main.pledge(&alice, &id, &50_000_000);

    // bob tries to pledge after goal is full - rejected
    let r = ctx.main.try_pledge(&bob, &id, &10_000_000);
    assert!(matches!(r, Err(Ok(Error::CampaignClosed))));
}

#[test]
fn pledge_that_overshoots_goal_is_rejected() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    // tries to pledge more than the goal in one shot
    let r = ctx.main.try_pledge(&backer, &id, &60_000_000);
    assert!(matches!(r, Err(Ok(Error::PledgeExceedsRemaining))));

    // partial pledge then a second pledge that would push past the goal
    ctx.main.pledge(&backer, &id, &30_000_000);
    let r2 = ctx.main.try_pledge(&backer, &id, &25_000_000);
    assert!(matches!(r2, Err(Ok(Error::PledgeExceedsRemaining))));
}

#[test]
fn claim_blocked_when_goal_not_met() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    ctx.main.pledge(&backer, &id, &30_000_000);

    // even after deadline, claim fails because goal wasn't met
    ctx.env.ledger().with_mut(|l| l.timestamp = 3_000);
    let r = ctx.main.try_claim(&id);
    assert!(matches!(r, Err(Ok(Error::GoalNotMet))));
}

#[test]
fn refund_returns_pledge_when_goal_missed() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 200_000_000, 2_000);
    ctx.main.pledge(&backer, &id, &30_000_000);
    assert_eq!(ctx.token.balance(&backer), 70_000_000);

    ctx.env.ledger().with_mut(|l| l.timestamp = 3_000);
    ctx.main.refund(&backer, &id);

    assert_eq!(ctx.token.balance(&backer), 100_000_000);
    assert_eq!(ctx.main.pledged_by(&id, &backer), 0);
    assert_eq!(ctx.receipt.balance(&backer), 1);

    let again = ctx.main.try_refund(&backer, &id);
    assert!(matches!(again, Err(Ok(Error::NoPledgeFound))));
}

#[test]
fn cannot_pledge_after_deadline() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    ctx.env.ledger().with_mut(|l| l.timestamp = 3_000);

    let result = ctx.main.try_pledge(&backer, &id, &10_000_000);
    assert!(matches!(result, Err(Ok(Error::CampaignClosed))));
}

#[test]
fn unknown_campaign_returns_error() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);
    assert_eq!(ctx.main.pledged_by(&999, &stranger), 0);
    let result = ctx.main.try_campaign(&999);
    assert!(matches!(result, Err(Ok(Error::UnknownCampaign))));
}

#[test]
fn refund_blocked_when_goal_was_met() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);
    fund(&ctx, &backer, 100_000_000);

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    ctx.main.pledge(&backer, &id, &50_000_000);

    ctx.env.ledger().with_mut(|l| l.timestamp = 3_000);
    let r = ctx.main.try_refund(&backer, &id);
    assert!(matches!(r, Err(Ok(Error::GoalAlreadyMet))));
}

#[test]
fn negative_amounts_rejected() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    let backer = Address::generate(&ctx.env);

    let bad_goal = ctx.main.try_create_campaign(
        &creator,
        &creator,
        &String::from_str(&ctx.env, "Print run"),
        &-1,
        &2_000,
    );
    assert!(matches!(bad_goal, Err(Ok(Error::GoalMustBePositive))));

    let id = open_campaign(&ctx, &creator, &creator, 50_000_000, 2_000);
    let bad_pledge = ctx.main.try_pledge(&backer, &id, &-5);
    assert!(matches!(bad_pledge, Err(Ok(Error::AmountMustBePositive))));
}
