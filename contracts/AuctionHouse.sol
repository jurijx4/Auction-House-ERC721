// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


/*Requirements:
Auction Creation:

Users should be able to create an auction for an ERC721 token they own.
The auction should have a starting bid, a minimum increment for bids, and a duration.
The user creating the auction must approve the auction contract to transfer the NFT.
Bidding Mechanism:

Users should be able to place bids on an active auction.
Each new bid must be higher than the previous bid by at least the minimum increment.
Refund the previous highest bidder when a new higher bid is placed.
Auction Finalization:

Once the auction duration has passed, anyone should be able to finalize the auction.
Transfer the NFT to the highest bidder and send the funds to the auction creator.
If there were no bids, return the NFT to the auction creator.
Security Considerations:

Prevent re-entrancy attacks when handling funds.
Ensure only valid NFT addresses can be auctioned.
Handle cases where the auction creator may withdraw their auction before any bids have been placed.
Additional Features:

Add an emergency stop feature allowing the contract owner to pause all auctions in case of a bug or security issue.
Allow users to view active auctions and their details, such as the highest bid, auction creator, and remaining time.
Testing Requirements:

Write comprehensive test cases to cover all scenarios, including normal flows, edge cases, and negative tests.
Test the re-entrancy protection by simulating potential attack scenarios. */

contract AuctionHouse is ReentrancyGuard{
    
    struct Auction {
        uint256 auctionId;
        address ERC721ContractAddress;
        uint256 tokenId;
        uint256 startingBid;
        address highestBidder; 
        uint256 minIncrement;
        uint256 highestBid; 
        uint256 endTime;
        address seller;
        bool active;
    }

    struct Bid{
        address bidder;
        uint256 bidingAmount;
    }

    mapping (uint256 => Auction) auctions;
    mapping (uint256 => Bid[]) auctionBids;

    uint256 auctionIdCounter;
    address owner;
    bool emergency;

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed erc721Contract, uint256 tokenId, uint256 startingBid, uint256 duration);
    event NewBid(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount);
    event AuctionFinalized(uint256 indexed auctionId, address indexed winner, uint256 finalBid);

    modifier OnlyOwner {
        require(msg.sender == owner, "Only owner of this contract is allowed to call this function.");
        _;
    }


    modifier IsERC721Owner(address ERC721Contract, uint256 tokenId ){
        IERC721 erc721Contract = IERC721(ERC721Contract);
        address realOwner = erc721Contract.ownerOf(tokenId);
        require(msg.sender == realOwner , "Only owner of this token is allowed to put it on auction.");
        _;
    }

    modifier ValidAuctionParameters(uint256 startingBid, uint256 minIncrement, uint256 duration){
        require(startingBid > 0, "Starting bid needs to be bigger than 0.");
        require(minIncrement > 0, "Minimum increment needs to be bigger than zero");
        require(duration > 86400, "Auction needs to last at least for a day.");
        _;
    }

    modifier EmergencyStop(){
        require(emergency == true, "We are experiencing some troubles. Contract will be active shortlly.");
        _;
    }


    constructor(){
        owner = msg.sender ;
        auctionIdCounter = 0;
        emergency = false; 
    }

    function createAuction(address erc721Contract, uint256 tokenId, uint256 startingBid, uint256 minIncrement, uint256 duration) 
        IsERC721Owner(erc721Contract, tokenId) 
        ValidAuctionParameters(startingBid, minIncrement, duration) 
        external {
         IERC721 ERC721Contract = IERC721(erc721Contract);

        // Check if the auction contract is already approved to transfer the token
        require(
            ERC721Contract.getApproved(tokenId) == address(this) || 
            ERC721Contract.isApprovedForAll(msg.sender, address(this)),
            "Auction contract is not approved to transfer this token. Please approve first."
        );

        // State change before external calls
        auctionIdCounter++;

        // Initialize the auction with all necessary details
        auctions[auctionIdCounter] = Auction({
            auctionId: auctionIdCounter,
            ERC721ContractAddress: erc721Contract,
            tokenId: tokenId,
            startingBid: startingBid,
            minIncrement: minIncrement,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + duration,
            seller: msg.sender,
            active: true
        });

        emit AuctionCreated(auctionIdCounter, msg.sender, erc721Contract, tokenId, startingBid, block.timestamp + duration);
    }


    function bid(uint256 auctionId) external payable EmergencyStop {
        // Logic for placing a bid
        require(auctions[auctionId].active == true, "This auction has closed.");
        require((msg.value - auctions[auctionId].highestBid) >= auctions[auctionId].minIncrement, "Your bid is not high enough.");

        if (auctions[auctionId].highestBid < msg.value){
            
            //Update auction bidder
            auctions[auctionId].highestBid = msg.value;
            auctions[auctionId].highestBidder = msg.sender;


            //Add a bid to refund later 
            auctionBids[auctionId].push(Bid(msg.sender, msg.value));

            emit NewBid( auctionId, msg.sender, msg.value);
        }
    }



    function finalizeAuction(uint256 auctionId) external EmergencyStop nonReentrant {
        // Logic for finalizing auction
        require(block.timestamp >= auctions[auctionId].endTime,"Auction is not yet finished.");

        //Pay the owner of the Auction and refund the losers of the auction
        payAuctionOwner(auctionId);
        payBackOtherBidders(auctionId);

        //Change the status of an auction
        auctions[auctionId].active = false;

        emit AuctionFinalized( auctionId, auctions[auctionId].highestBidder, auctions[auctionId].highestBid);

    }

    function payAuctionOwner(uint256 auctionId) internal{
        payable(auctions[auctionId].highestBidder).transfer(auctions[auctionId].highestBid);
    }

    function payBackOtherBidders(uint256 auctionId) internal {
        // Logic for paying back other bidders
        for (uint i = 0; i <  auctionBids[auctionId].length- 1; i++) {
            if(auctionBids[auctionId][i].bidingAmount != auctions[auctionId].highestBid){
                 payable(auctionBids[auctionId][i].bidder).transfer(auctionBids[auctionId][i].bidingAmount);
            }
        }

    }

    function emergencyStop() external OnlyOwner {
        // Logic for stopping all auctions
        emergency = true;
    }


    function disableEmergency() external OnlyOwner {
        // Logic for disablening Emergency
        emergency = false;
    }
    // Additional helper functions...
}