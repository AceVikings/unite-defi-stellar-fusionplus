import { expect } from "chai";
import { ethers } from "hardhat";
import { CrossChainHTLC, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("CrossChainHTLC Enhanced", function () {
  // Test accounts
  let htlc: CrossChainHTLC;
  let mockToken: MockERC20;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let resolver: HardhatEthersSigner;

  // Test constants
  const INITIAL_TOKEN_SUPPLY = ethers.parseEther("1000000");
  const LOCK_AMOUNT = ethers.parseEther("100");
  const ETH_LOCK_AMOUNT = ethers.parseEther("1");
  const SECRET = "0x" + "a".repeat(64); // 32 bytes hex string
  const HASHLOCK = ethers.sha256(SECRET); // Use sha256 to match contract
  const ONE_HOUR = 3600;
  const ONE_DAY = 86400;
  const RESOLVER_COLLATERAL = ethers.parseEther("10");

  async function deployHTLCFixture() {
    const [owner, alice, bob, charlie, resolver] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy(
      "Test Token",
      "TEST",
      18,
      ethers.parseEther("1000000")
    );

    // Deploy HTLC with owner as fee recipient
    const CrossChainHTLC = await ethers.getContractFactory("CrossChainHTLC");
    const htlc = await CrossChainHTLC.deploy(await owner.getAddress());

    // Set token approval for mock token
    await htlc.setTokenApproval(await mockToken.getAddress(), true);

    // Distribute tokens for testing
    await mockToken.transfer(await alice.getAddress(), LOCK_AMOUNT * 10n);
    await mockToken.transfer(await bob.getAddress(), LOCK_AMOUNT * 10n);

    // Register resolver
    await htlc
      .connect(resolver)
      .registerResolver("QmTestReputationHash", { value: RESOLVER_COLLATERAL });

    return { htlc, mockToken, owner, alice, bob, charlie, resolver };
  }

  beforeEach(async function () {
    ({ htlc, mockToken, owner, alice, bob, charlie, resolver } =
      await loadFixture(deployHTLCFixture));
  });

  describe("Deployment", function () {
    it("Should deploy successfully with proper initialization", async function () {
      expect(await htlc.getAddress()).to.properAddress;
      expect(await mockToken.getAddress()).to.properAddress;

      // Check initial configuration
      expect(await htlc.owner()).to.equal(await owner.getAddress());
      expect(await htlc.feeRecipient()).to.equal(await owner.getAddress());
      expect(await htlc.protocolFeeBps()).to.equal(30); // 0.3%
      expect(await htlc.VERSION()).to.equal("1.0.0");

      // Check token approvals
      expect(await htlc.isTokenApproved(ethers.ZeroAddress)).to.be.true; // ETH
      expect(await htlc.isTokenApproved(await mockToken.getAddress())).to.be
        .true;
    });

    it("Should have correct initial token balances", async function () {
      expect(await mockToken.balanceOf(alice.getAddress())).to.equal(
        LOCK_AMOUNT * 10n
      );
      expect(await mockToken.balanceOf(bob.getAddress())).to.equal(
        LOCK_AMOUNT * 10n
      );
    });

    it("Should have resolver registered correctly", async function () {
      const resolverInfo = await htlc.getResolverInfo(
        await resolver.getAddress()
      );
      expect(resolverInfo.isActive).to.be.true;
      expect(resolverInfo.collateral).to.equal(RESOLVER_COLLATERAL);
      expect(resolverInfo.totalSwaps).to.equal(0);
      expect(resolverInfo.successfulSwaps).to.equal(0);
      expect(resolverInfo.reputation).to.equal("QmTestReputationHash");
    });
  });

  describe("ERC20 Token Swaps", function () {
    it("Should lock ERC20 tokens successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Approve tokens
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      // Lock funds with enhanced parameters
      const tx = await htlc.connect(alice).lockFunds(
        await bob.getAddress(), // recipient
        await mockToken.getAddress(), // token
        LOCK_AMOUNT, // amount
        HASHLOCK, // hashlock
        timelock, // timelock
        await resolver.getAddress(), // resolver
        "stellar_tx_hash_123" // stellarTxHash
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");

      // Parse event to get swap ID
      let swapId: string = "";
      for (const log of receipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      expect(swapId).to.not.equal("");

      // Verify swap data
      const swapData = await htlc.getSwapData(swapId);
      expect(swapData.sender).to.equal(await alice.getAddress());
      expect(swapData.recipient).to.equal(await bob.getAddress());
      expect(swapData.token).to.equal(await mockToken.getAddress());
      expect(swapData.hashlock).to.equal(HASHLOCK);
      expect(swapData.timelock).to.equal(timelock);
      expect(swapData.resolver).to.equal(await resolver.getAddress());
      expect(swapData.stellarTxHash).to.equal("stellar_tx_hash_123");
      expect(swapData.status).to.equal(1); // ACTIVE
      expect(swapData.claimed).to.be.false;
      expect(swapData.refunded).to.be.false;

      // Check protocol fee was deducted
      const expectedFee = (LOCK_AMOUNT * 30n) / 10000n; // 0.3%
      const expectedNetAmount = LOCK_AMOUNT - expectedFee;
      expect(swapData.amount).to.equal(expectedNetAmount);
      expect(swapData.protocolFee).to.equal(expectedFee);

      // Verify events
      await expect(tx)
        .to.emit(htlc, "FundsLocked")
        .withArgs(
          swapId,
          await alice.getAddress(),
          await bob.getAddress(),
          await mockToken.getAddress(),
          expectedNetAmount,
          HASHLOCK,
          timelock,
          await resolver.getAddress(),
          "stellar_tx_hash_123"
        );

      await expect(tx).to.emit(htlc, "SwapStatusUpdated");
    });

    it("Should claim ERC20 tokens successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Approve and lock tokens
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);
      const lockTx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock,
          await resolver.getAddress(),
          "stellar_tx_hash_123"
        );

      const lockReceipt = await lockTx.wait();
      if (!lockReceipt) throw new Error("Lock receipt is null");

      // Get swap ID from event
      let swapId: string = "";
      for (const log of lockReceipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Check initial balances
      const bobInitialBalance = await mockToken.balanceOf(
        await bob.getAddress()
      );

      // Claim funds
      const claimTx = await htlc.connect(bob).claimFunds(swapId, SECRET);

      // Verify claim event
      const expectedNetAmount = LOCK_AMOUNT - (LOCK_AMOUNT * 30n) / 10000n;
      const expectedFee = (LOCK_AMOUNT * 30n) / 10000n;

      await expect(claimTx)
        .to.emit(htlc, "FundsClaimed")
        .withArgs(
          swapId,
          await bob.getAddress(),
          SECRET,
          expectedNetAmount,
          expectedFee
        );

      await expect(claimTx).to.emit(htlc, "SwapStatusUpdated");

      // Check final balances
      const bobFinalBalance = await mockToken.balanceOf(await bob.getAddress());
      expect(bobFinalBalance - bobInitialBalance).to.equal(expectedNetAmount);

      // Verify swap status
      const swapData = await htlc.getSwapData(swapId);
      expect(swapData.claimed).to.be.true;
      expect(swapData.preimage).to.equal(SECRET);
      expect(swapData.status).to.equal(2); // CLAIMED

      // Check resolver stats updated
      const resolverInfo = await htlc.getResolverInfo(
        await resolver.getAddress()
      );
      expect(resolverInfo.totalSwaps).to.equal(1);
      expect(resolverInfo.successfulSwaps).to.equal(1);
    });

    it("Should refund ERC20 tokens after timeout", async function () {
      const timelock = (await time.latest()) + (2 * ONE_HOUR); // Must be > MIN_TIMELOCK_DURATION (1 hour)

      // Approve and lock tokens
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);
      const lockTx = await htlc.connect(alice).lockFunds(
        await bob.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock,
        ethers.ZeroAddress, // No resolver
        ""
      );

      const lockReceipt = await lockTx.wait();
      if (!lockReceipt) throw new Error("Lock receipt is null");

      // Get swap ID
      let swapId: string = "";
      for (const log of lockReceipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Fast forward past timelock
      await time.increaseTo(timelock + 1);

      // Check initial balances
      const aliceInitialBalance = await mockToken.balanceOf(
        await alice.getAddress()
      );

      // Refund funds
      const refundTx = await htlc.connect(alice).refundFunds(swapId);

      // Calculate expected refund amount (net amount after protocol fee deduction)
      const protocolFeeBps = await htlc.protocolFeeBps();
      const protocolFee = (LOCK_AMOUNT * protocolFeeBps) / 10000n;
      const expectedRefund = LOCK_AMOUNT - protocolFee;

      // Verify refund event (protocol fee already transferred to recipient during lock)
      await expect(refundTx)
        .to.emit(htlc, "FundsRefunded")
        .withArgs(swapId, await alice.getAddress(), expectedRefund);

      await expect(refundTx).to.emit(htlc, "SwapStatusUpdated");

      // Check final balances (gets back only locked amount, protocol fee stays with recipient)
      const aliceFinalBalance = await mockToken.balanceOf(
        await alice.getAddress()
      );
      expect(aliceFinalBalance - aliceInitialBalance).to.equal(expectedRefund);

      // Verify swap status
      const swapData = await htlc.getSwapData(swapId);
      expect(swapData.refunded).to.be.true;
      expect(swapData.status).to.equal(3); // REFUNDED
    });

    it("Should reject unapproved tokens", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Create new token that's not approved
      const NewToken = await ethers.getContractFactory("MockERC20");
      const newToken = await NewToken.deploy(
        "New Token",
        "NEW",
        18,
        ethers.parseEther("1000")
      );

      await newToken.transfer(await alice.getAddress(), LOCK_AMOUNT);
      await newToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      // Should fail because token is not approved
      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await newToken.getAddress(),
            LOCK_AMOUNT,
            HASHLOCK,
            timelock,
            ethers.ZeroAddress,
            ""
          )
      ).to.be.revertedWithCustomError(htlc, "TokenNotApproved");
    });

    it("Should reject inactive resolver", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Deactivate resolver
      await htlc.deactivateResolver(
        await resolver.getAddress(),
        "Test deactivation"
      );

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      // Should fail because resolver is inactive
      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
            LOCK_AMOUNT,
            HASHLOCK,
            timelock,
            await resolver.getAddress(),
            "stellar_tx_hash"
          )
      ).to.be.revertedWithCustomError(htlc, "ResolverNotActive");
    });
  });

  describe("ETH Swaps", function () {
    it("Should lock ETH successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      const tx = await htlc
        .connect(alice)
        .lockETH(
          await bob.getAddress(),
          HASHLOCK,
          timelock,
          await resolver.getAddress(),
          "stellar_tx_hash_456",
          { value: ETH_LOCK_AMOUNT }
        );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");

      // Parse event to get swap ID
      let swapId: string = "";
      for (const log of receipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Verify swap data
      const swapData = await htlc.getSwapData(swapId);
      expect(swapData.token).to.equal(ethers.ZeroAddress); // ETH
      expect(swapData.stellarTxHash).to.equal("stellar_tx_hash_456");

      // Check protocol fee was deducted
      const expectedFee = (ETH_LOCK_AMOUNT * 30n) / 10000n; // 0.3%
      const expectedNetAmount = ETH_LOCK_AMOUNT - expectedFee;
      expect(swapData.amount).to.equal(expectedNetAmount);
    });

    it("Should claim ETH successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Lock ETH
      const lockTx = await htlc
        .connect(alice)
        .lockETH(
          await bob.getAddress(),
          HASHLOCK,
          timelock,
          ethers.ZeroAddress,
          "",
          { value: ETH_LOCK_AMOUNT }
        );

      const lockReceipt = await lockTx.wait();
      if (!lockReceipt) throw new Error("Lock receipt is null");

      // Get swap ID
      let swapId: string = "";
      for (const log of lockReceipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Check initial balance
      const bobInitialBalance = await ethers.provider.getBalance(
        await bob.getAddress()
      );

      // Claim funds
      const claimTx = await htlc.connect(bob).claimFunds(swapId, SECRET);
      const claimReceipt = await claimTx.wait();
      if (!claimReceipt) throw new Error("Claim receipt is null");

      // Calculate expected amounts
      const expectedNetAmount =
        ETH_LOCK_AMOUNT - (ETH_LOCK_AMOUNT * 30n) / 10000n;
      const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;

      // Check final balance (accounting for gas)
      const bobFinalBalance = await ethers.provider.getBalance(
        await bob.getAddress()
      );
      const actualReceived = bobFinalBalance - bobInitialBalance + gasUsed;
      expect(actualReceived).to.equal(expectedNetAmount);
    });
  });

  describe("Admin Functions", function () {
    it("Should update protocol fee", async function () {
      const newFee = 50; // 0.5%

      await expect(htlc.updateProtocolFee(newFee))
        .to.emit(htlc, "ProtocolFeeUpdated")
        .withArgs(30, newFee);

      expect(await htlc.protocolFeeBps()).to.equal(newFee);
    });

    it("Should reject fee too high", async function () {
      await expect(htlc.updateProtocolFee(1001)) // >10%
        .to.be.revertedWithCustomError(htlc, "FeeTooHigh");
    });

    it("Should update fee recipient", async function () {
      await expect(htlc.updateFeeRecipient(await alice.getAddress()))
        .to.emit(htlc, "FeeRecipientUpdated")
        .withArgs(await owner.getAddress(), await alice.getAddress());

      expect(await htlc.feeRecipient()).to.equal(await alice.getAddress());
    });

    it("Should set token approval", async function () {
      const testTokenAddress = await charlie.getAddress(); // Use random address for test

      await expect(htlc.setTokenApproval(testTokenAddress, true))
        .to.emit(htlc, "TokenApprovalChanged")
        .withArgs(testTokenAddress, true);

      expect(await htlc.isTokenApproved(testTokenAddress)).to.be.true;

      // Disapprove
      await expect(htlc.setTokenApproval(testTokenAddress, false))
        .to.emit(htlc, "TokenApprovalChanged")
        .withArgs(testTokenAddress, false);

      expect(await htlc.isTokenApproved(testTokenAddress)).to.be.false;
    });

    it("Should reject non-owner admin calls", async function () {
      await expect(
        htlc.connect(alice).updateProtocolFee(50)
      ).to.be.revertedWithCustomError(htlc, "OwnableUnauthorizedAccount");

      await expect(
        htlc.connect(alice).updateFeeRecipient(await alice.getAddress())
      ).to.be.revertedWithCustomError(htlc, "OwnableUnauthorizedAccount");

      await expect(
        htlc
          .connect(alice)
          .setTokenApproval(await mockToken.getAddress(), false)
      ).to.be.revertedWithCustomError(htlc, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return contract statistics", async function () {
      // Create a swap to have some data
      const timelock = (await time.latest()) + ONE_DAY;
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock,
          ethers.ZeroAddress,
          ""
        );

      const stats = await htlc.getContractStats();
      expect(stats._totalSwapsCreated).to.equal(1);
      expect(stats._totalSwapsClaimed).to.equal(0);
      expect(stats._totalSwapsRefunded).to.equal(0);
      expect(stats._totalActiveSwaps).to.equal(1);
      expect(stats._totalFeesCollected).to.be.gt(0);
    });

    it("Should check swap states correctly", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      const lockTx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock,
          ethers.ZeroAddress,
          ""
        );

      const lockReceipt = await lockTx.wait();
      if (!lockReceipt) throw new Error("Lock receipt is null");

      // Get swap ID
      let swapId: string = "";
      for (const log of lockReceipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Check initial state
      expect(await htlc.swapExists(swapId)).to.be.true;
      expect(await htlc.isSwapClaimable(swapId)).to.be.true;
      expect(await htlc.isSwapRefundable(swapId)).to.be.false;

      // Fast forward past timelock
      await time.increaseTo(timelock + 1);

      // Check state after timeout
      expect(await htlc.isSwapClaimable(swapId)).to.be.false;
      expect(await htlc.isSwapRefundable(swapId)).to.be.true;
    });

    it("Should return user swaps correctly", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT * 2n);

      // Create two swaps
      await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock,
          ethers.ZeroAddress,
          ""
        );

      await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock + 1000,
          ethers.ZeroAddress,
          ""
        );

      const userSwaps = await htlc.getUserSwaps(await alice.getAddress());
      expect(userSwaps.length).to.equal(2);

      const activeSwaps = await htlc.getActiveUserSwaps(
        await alice.getAddress()
      );
      expect(activeSwaps.length).to.equal(2);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas costs", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      // Test lock gas cost
      const lockTx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock,
          ethers.ZeroAddress,
          ""
        );

      const lockReceipt = await lockTx.wait();
      if (!lockReceipt) throw new Error("Lock receipt is null");

      console.log("Lock gas used:", lockReceipt.gasUsed.toString());
      expect(lockReceipt.gasUsed).to.be.lt(500000); // Enhanced contract with additional features

      // Get swap ID
      let swapId: string = "";
      for (const log of lockReceipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch (e) {
          // Skip logs that can't be parsed
        }
      }

      // Test claim gas cost
      const claimTx = await htlc.connect(bob).claimFunds(swapId, SECRET);
      const claimReceipt = await claimTx.wait();
      if (!claimReceipt) throw new Error("Claim receipt is null");

      console.log("Claim gas used:", claimReceipt.gasUsed.toString());
      expect(claimReceipt.gasUsed).to.be.lt(150000); // Enhanced contract with additional features
    });
  });
});
