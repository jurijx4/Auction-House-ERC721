const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuctionHouse Contract", function () {
  let auctionHouse;
  let mockNFT;
  let owner, seller, bidder1, bidder2;

  const tokenId = 1;
  const startingBid = ethers.utils.parseEther("1");
  const minIncrement = ethers.utils.parseEther("0.1");
  const auctionDuration = 86400; // 1 day

  beforeEach(async function () {
    // Get signers
    [owner, seller, bidder1, bidder2] = await ethers.getSigners();

    // Deploy Mock NFT Contract (assuming it is already implemented)
    const MockNFT = await ethers.getContractFactory("MockNFT");
    mockNFT = await MockNFT.connect(seller).deploy();
    await mockNFT.deployed();

    // Mint an NFT to seller
    await mockNFT.connect(seller).mint(seller.address, tokenId);

    // Deploy AuctionHouse contract
    const AuctionHouse = await ethers.getContractFactory("AuctionHouse");
    auctionHouse = await AuctionHouse.connect(owner).deploy();
    await auctionHouse.deployed();
  });

  describe("Auction Creation", function () {
    it("should create an auction successfully", async function () {
      // Approve AuctionHouse to transfer NFT
      await mockNFT.connect(seller).approve(auctionHouse.address, tokenId);

      // Create auction
      await expect(
        auctionHouse.connect(seller).createAuction(
          mockNFT.address,
          tokenId,
          startingBid,
          minIncrement,
          auctionDuration
        )
      )
        .to.emit(auctionHouse, "AuctionCreated")
        .withArgs(
          1,
          seller.address,
          mockNFT.address,
          tokenId,
          startingBid,
          (await ethers.provider.getBlock("latest")).timestamp + auctionDuration
        );

      const auction = await auctionHouse.auctions(1);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.ERC721ContractAddress).to.equal(mockNFT.address);
      expect(auction.tokenId).to.equal(tokenId);
      expect(auction.startingBid).to.equal(startingBid);
      expect(auction.minIncrement).to.equal(minIncrement);
      expect(auction.active).to.equal(true);
    });

    it("should not allow creating an auction if the contract is not approved", async function () {
      await expect(
        auctionHouse.connect(seller).createAuction(
          mockNFT.address,
          tokenId,
          startingBid,
          minIncrement,
          auctionDuration
        )
      ).to.be.revertedWith("Auction contract is not approved to transfer this token. Please approve first.");
    });
  });

  describe("Bidding", function () {
    beforeEach(async function () {
      await mockNFT.connect(seller).approve(auctionHouse.address, tokenId);
      await auctionHouse.connect(seller).createAuction(
        mockNFT.address,
        tokenId,
        startingBid,
        minIncrement,
        auctionDuration
      );
    });

    it("should allow a valid bid", async function () {
      await expect(
        auctionHouse.connect(bidder1).bid(1, { value: startingBid })
      )
        .to.emit(auctionHouse, "NewBid")
        .withArgs(1, bidder1.address, startingBid);

      const auction = await auctionHouse.auctions(1);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(startingBid);
    });

    it("should not allow a bid lower than the starting bid", async function () {
      await expect(
        auctionHouse.connect(bidder1).bid(1, { value: startingBid.sub(1) })
      ).to.be.revertedWith("Bid must be at least the starting bid.");
    });

    it("should not allow a bid less than the minimum increment above the highest bid", async function () {
      await auctionHouse.connect(bidder1).bid(1, { value: startingBid });

      await expect(
        auctionHouse.connect(bidder2).bid(1, { value: startingBid.add(minIncrement).sub(1) })
      ).to.be.revertedWith("Your bid is not high enough.");
    });

    it("should refund the previous highest bidder on a new higher bid", async function () {
      await auctionHouse.connect(bidder1).bid(1, { value: startingBid });

      const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);

      await auctionHouse.connect(bidder2).bid(1, { value: startingBid.add(minIncrement) });

      const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);
      expect(bidder1BalanceAfter.sub(bidder1BalanceBefore)).to.equal(startingBid);
    });
  });

  describe("Finalizing Auction", function () {
    beforeEach(async function () {
      await mockNFT.connect(seller).approve(auctionHouse.address, tokenId);
      await auctionHouse.connect(seller).createAuction(
        mockNFT.address,
        tokenId,
        startingBid,
        minIncrement,
        auctionDuration
      );
    });

    it("should allow finalizing auction after end time with no bids", async function () {
      // Increase time to past the auction end time
      await ethers.provider.send("evm_increaseTime", [auctionDuration + 1]);
      await ethers.provider.send("evm_mine");

      await auctionHouse.connect(owner).finalizeAuction(1);

      const auction = await auctionHouse.auctions(1);
      expect(auction.active).to.equal(false);

      // Verify NFT is returned to seller
      expect(await mockNFT.ownerOf(tokenId)).to.equal(seller.address);
    });

    it("should finalize auction and transfer NFT to the highest bidder", async function () {
      await auctionHouse.connect(bidder1).bid(1, { value: startingBid });

      // Increase time to past the auction end time
      await ethers.provider.send("evm_increaseTime", [auctionDuration + 1]);
      await ethers.provider.send("evm_mine");

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      await auctionHouse.connect(owner).finalizeAuction(1);

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(startingBid);

      // Verify NFT is transferred to the highest bidder
      expect(await mockNFT.ownerOf(tokenId)).to.equal(bidder1.address);
    });
  });

  describe("Emergency Stop", function () {
    it("should stop all auctions in case of emergency", async function () {
      await auctionHouse.connect(owner).emergencyStop();

      await expect(
        auctionHouse.connect(seller).createAuction(
          mockNFT.address,
          tokenId,
          startingBid,
          minIncrement,
          auctionDuration
        )
      ).to.be.revertedWith("The contract is currently stopped due to an emergency.");
    });

    it("should resume auctions after emergency is disabled", async function () {
      await auctionHouse.connect(owner).emergencyStop();
      await auctionHouse.connect(owner).disableEmergency();

      await mockNFT.connect(seller).approve(auctionHouse.address, tokenId);

      await expect(
        auctionHouse.connect(seller).createAuction(
          mockNFT.address,
          tokenId,
          startingBid,
          minIncrement,
          auctionDuration
        )
      ).to.emit(auctionHouse, "AuctionCreated");
    });
  });
});