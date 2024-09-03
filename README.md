# Auction-House-ERC721

## Overview

The `AuctionHouse` contract is designed to facilitate the auctioning of ERC721 tokens (NFTs). Users who own NFTs can create auctions with specific parameters, such as a starting bid, minimum increment, and auction duration. Other users can then place bids on active auctions, with each new bid needing to be higher than the previous by at least the minimum increment. Once the auction duration has passed, the auction can be finalized, transferring the NFT to the highest bidder and sending the funds to the auction creator.

## Features

- **Auction Creation**: Allows NFT owners to create auctions for their tokens.
- **Bidding**: Enables users to place bids on active auctions, ensuring each new bid meets the minimum increment requirement.
- **Auction Finalization**: Allows for the transfer of the NFT to the highest bidder and the funds to the auction creator once the auction duration has ended.
- **Refund Mechanism**: Automatically refunds the previous highest bidder when a new higher bid is placed.
- **Emergency Stop**: Provides a mechanism for the contract owner to pause all auctions in case of a security issue.
