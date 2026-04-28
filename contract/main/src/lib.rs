#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype,
    symbol_short, token, Address, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    GoalMustBePositive = 2,
    DeadlineInPast = 3,
    AmountMustBePositive = 4,
    UnknownCampaign = 5,
    CampaignClosed = 6,
    DeadlineNotReached = 7,
    GoalNotMet = 8,
    GoalAlreadyMet = 9,
    AlreadyClaimed = 10,
    NoPledgeFound = 11,
    TitleEmpty = 12,
    PledgeExceedsRemaining = 13,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Live,
    Funded,
}

#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    pub creator: Address,
    pub beneficiary: Address,
    pub title: String,
    pub goal: i128,
    pub pledged: i128,
    pub deadline: u64,
    pub status: Status,
    pub backers: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Receipt,
    Token,
    NextId,
    Campaign(u32),
    Pledge(u32, Address),
}

#[contractclient(name = "ReceiptClient")]
pub trait ReceiptInterface {
    fn mint(env: Env, to: Address, amount: i128);
}

#[contract]
pub struct MainContract;

#[contractimpl]
impl MainContract {
    pub fn __constructor(env: Env, receipt: Address, token: Address) {
        env.storage().instance().set(&DataKey::Receipt, &receipt);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &0u32);
    }

    pub fn create_campaign(
        env: Env,
        creator: Address,
        beneficiary: Address,
        title: String,
        goal: i128,
        deadline: u64,
    ) -> Result<u32, Error> {
        creator.require_auth();
        if title.len() == 0 {
            return Err(Error::TitleEmpty);
        }
        if goal <= 0 {
            return Err(Error::GoalMustBePositive);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::DeadlineInPast);
        }

        let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        let campaign = Campaign {
            creator: creator.clone(),
            beneficiary,
            title,
            goal,
            pledged: 0,
            deadline,
            status: Status::Live,
            backers: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(id), &campaign);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        env.events().publish(
            (symbol_short!("created"), id, creator),
            (campaign.goal, campaign.deadline),
        );
        Ok(id)
    }

    pub fn pledge(
        env: Env,
        backer: Address,
        campaign_id: u32,
        amount: i128,
    ) -> Result<(), Error> {
        backer.require_auth();
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }
        let mut c: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .ok_or(Error::UnknownCampaign)?;
        if c.status != Status::Live {
            return Err(Error::CampaignClosed);
        }
        if env.ledger().timestamp() >= c.deadline {
            return Err(Error::CampaignClosed);
        }
        // goal-met = closed to new pledges. last pledge cannot overshoot goal.
        if c.pledged >= c.goal {
            return Err(Error::CampaignClosed);
        }
        if c.pledged + amount > c.goal {
            return Err(Error::PledgeExceedsRemaining);
        }

        // pull XLM into escrow
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&backer, &env.current_contract_address(), &amount);

        // record pledge
        let pkey = DataKey::Pledge(campaign_id, backer.clone());
        let prev: i128 = env.storage().persistent().get(&pkey).unwrap_or(0);
        if prev == 0 {
            c.backers += 1;
        }
        env.storage().persistent().set(&pkey, &(prev + amount));
        c.pledged += amount;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &c);

        // mint a supporter badge through the receipt contract
        let receipt_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Receipt)
            .ok_or(Error::NotInitialized)?;
        let receipt = ReceiptClient::new(&env, &receipt_addr);
        receipt.mint(&backer, &1i128);

        env.events()
            .publish((symbol_short!("pledge"), backer, campaign_id), amount);
        Ok(())
    }

    pub fn claim(env: Env, campaign_id: u32) -> Result<(), Error> {
        let mut c: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .ok_or(Error::UnknownCampaign)?;
        if c.status == Status::Funded {
            return Err(Error::AlreadyClaimed);
        }
        // beneficiary can claim as soon as the goal is met -
        // no need to wait for the deadline. if the goal isn't met
        // by the deadline, refund applies instead.
        if c.pledged < c.goal {
            return Err(Error::GoalNotMet);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        let payout = c.pledged;
        token_client.transfer(&env.current_contract_address(), &c.beneficiary, &payout);

        c.status = Status::Funded;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &c);

        env.events()
            .publish((symbol_short!("funded"), campaign_id), payout);
        Ok(())
    }

    pub fn refund(env: Env, backer: Address, campaign_id: u32) -> Result<(), Error> {
        backer.require_auth();
        let c: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .ok_or(Error::UnknownCampaign)?;
        if c.status == Status::Funded {
            return Err(Error::GoalAlreadyMet);
        }
        if env.ledger().timestamp() < c.deadline {
            return Err(Error::DeadlineNotReached);
        }
        if c.pledged >= c.goal {
            return Err(Error::GoalAlreadyMet);
        }

        let pkey = DataKey::Pledge(campaign_id, backer.clone());
        let pledged_amount: i128 = env.storage().persistent().get(&pkey).unwrap_or(0);
        if pledged_amount <= 0 {
            return Err(Error::NoPledgeFound);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&env.current_contract_address(), &backer, &pledged_amount);

        env.storage().persistent().set(&pkey, &0i128);

        env.events().publish(
            (symbol_short!("refund"), backer, campaign_id),
            pledged_amount,
        );
        Ok(())
    }

    pub fn campaign(env: Env, id: u32) -> Result<Campaign, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(id))
            .ok_or(Error::UnknownCampaign)
    }

    pub fn pledged_by(env: Env, id: u32, backer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Pledge(id, backer))
            .unwrap_or(0)
    }

    pub fn campaign_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn receipt_contract(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Receipt)
            .ok_or(Error::NotInitialized)
    }

    pub fn token_contract(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)
    }
}

#[cfg(test)]
mod test;
