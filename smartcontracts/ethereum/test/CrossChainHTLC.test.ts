import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("CrossChainHTLC", function () {
  // Test accounts
  let htlc: Contract;
  let mockToken: Contract;
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let charlie: Signer;

  // Test constants
  const INITIAL_TOKEN_SUPPLY = ethers.parseEther("1000000");
  const LOCK_AMOUNT = ethers.parseEther("100");
  const ETH_LOCK_AMOUNT = ethers.parseEther("1");
  const SECRET = "0x" + "a".repeat(64); // 32 bytes hex string
  const HASHLOCK = ethers.sha256(SECRET); // Use sha256 to match contract
  const ONE_HOUR = 3600;
  const ONE_DAY = 86400;

  async function deployHTLCFixture() {
    const [owner, alice, bob, charlie] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy(
      "Test Token",
      "TEST",
      18,
      ethers.parseEther("1000000")
    );

    // Deploy HTLC
    const CrossChainHTLC = await ethers.getContractFactory("CrossChainHTLC");
    const htlc = await CrossChainHTLC.deploy();

    // Distribute tokens for testing
    await mockToken.transfer(alice.getAddress(), LOCK_AMOUNT * 10n);
    await mockToken.transfer(bob.getAddress(), LOCK_AMOUNT * 10n);

    return { htlc, mockToken, owner, alice, bob, charlie };
  }

  beforeEach(async function () {
    ({ htlc, mockToken, owner, alice, bob, charlie } = await loadFixture(deployHTLCFixture));
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await htlc.getAddress()).to.properAddress;
      expect(await mockToken.getAddress()).to.properAddress;
    });

    it("Should have correct initial token balances", async function () {
      expect(await mockToken.balanceOf(alice.getAddress())).to.equal(LOCK_AMOUNT * 10n);
      expect(await mockToken.balanceOf(bob.getAddress())).to.equal(LOCK_AMOUNT * 10n);
    });
  });

  describe("Lock Funds (ERC20)", function () {
    it("Should lock ERC20 tokens successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Approve tokens
      await mockToken.connect(alice).approve(htlc.getAddress(), LOCK_AMOUNT);
      
      // Lock funds
      const tx = await htlc.connect(alice).lockFunds(
        bob.getAddress(),
        mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      const swapId = event.args.swapId;

      // Check swap data
      const swap = await htlc.getSwapData(swapId);
      expect(swap.sender).to.equal(await alice.getAddress());
      expect(swap.recipient).to.equal(await bob.getAddress());
      expect(swap.token).to.equal(await mockToken.getAddress());
      expect(swap.amount).to.equal(LOCK_AMOUNT);
      expect(swap.hashlock).to.equal(HASHLOCK);
      expect(swap.timelock).to.equal(timelock);
      expect(swap.claimed).to.be.false;
      expect(swap.refunded).to.be.false;

      // Check balances
      expect(await mockToken.balanceOf(await htlc.getAddress())).to.equal(LOCK_AMOUNT);
      expect(await mockToken.balanceOf(await alice.getAddress())).to.equal(LOCK_AMOUNT * 9n);
    });

    it("Should emit FundsLocked event", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      await mockToken.connect(alice).approve(await htlc.getAddress(), LOCK_AMOUNT);
      
      await expect(
        htlc.connect(alice).lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
        )
      ).to.emit(htlc, "FundsLocked");
    });
    });

    it("Should revert with invalid timelock", async function () {
      const pastTimelock = (await time.latest()) - 1000;
      
      await mockToken.connect(alice).approve(htlc.getAddress(), LOCK_AMOUNT);
      
      await expect(
        htlc.connect(alice).lockFunds(
          bob.getAddress(),
          mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          pastTimelock
        )
      ).to.be.revertedWithCustomError(htlc, "InvalidTimelock");
    });

    it("Should revert with insufficient timelock duration", async function () {
      const shortTimelock = (await time.latest()) + 30 * 60; // 30 minutes
      
      await mockToken.connect(alice).approve(htlc.getAddress(), LOCK_AMOUNT);
      
      await expect(
        htlc.connect(alice).lockFunds(
          bob.getAddress(),
          mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          shortTimelock
        )
      ).to.be.revertedWithCustomError(htlc, "InvalidTimelock");
    });

    it("Should revert with invalid amount", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      await expect(
        htlc.connect(alice).lockFunds(
          bob.getAddress(),
          mockToken.getAddress(),
          0,
          HASHLOCK,
          timelock
        )
      ).to.be.revertedWithCustomError(htlc, "InvalidAmount");
    });

    it("Should revert with invalid hashlock", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      await mockToken.connect(alice).approve(htlc.getAddress(), LOCK_AMOUNT);
      
      await expect(
        htlc.connect(alice).lockFunds(
          bob.getAddress(),
          mockToken.getAddress(),
          LOCK_AMOUNT,
          ethers.ZeroHash,
          timelock
        )
      ).to.be.revertedWithCustomError(htlc, "InvalidHashlock");
    });
  });

  describe("Lock ETH", function () {
    it("Should lock ETH successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      const tx = await htlc.connect(alice).lockETH(
        bob.getAddress(),
        HASHLOCK,
        timelock,
        { value: ETH_LOCK_AMOUNT }
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      const swapId = event.args.swapId;

      // Check swap data
      const swap = await htlc.getSwapData(swapId);
      expect(swap.sender).to.equal(await alice.getAddress());
      expect(swap.recipient).to.equal(await bob.getAddress());
      expect(swap.token).to.equal(ethers.ZeroAddress);
      expect(swap.amount).to.equal(ETH_LOCK_AMOUNT);
      expect(swap.hashlock).to.equal(HASHLOCK);
      expect(swap.timelock).to.equal(timelock);

      // Check contract balance
      expect(await ethers.provider.getBalance(await htlc.getAddress())).to.equal(ETH_LOCK_AMOUNT);
    });

    it("Should revert with zero ETH", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      await expect(
        htlc.connect(alice).lockETH(
          await bob.getAddress(),
          HASHLOCK,
          timelock,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(htlc, "InvalidAmount");
    });
  });

  describe("Claim Funds", function () {
    let swapId: string;

    beforeEach(async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Lock tokens
      await mockToken.connect(alice).approve(await htlc.getAddress(), LOCK_AMOUNT);
      const tx = await htlc.connect(alice).lockFunds(
        await bob.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      swapId = event.args.swapId;
    });

    it("Should claim funds with correct preimage", async function () {
      const bobBalanceBefore = await mockToken.balanceOf(bob.getAddress());
      
      await expect(
        htlc.connect(bob).claimFunds(swapId, SECRET)
      ).to.emit(htlc, "FundsClaimed")
        .withArgs(swapId, await bob.getAddress(), SECRET, LOCK_AMOUNT);

      // Check balances
      const bobBalanceAfter = await mockToken.balanceOf(await bob.getAddress());
      expect(bobBalanceAfter - bobBalanceBefore).to.equal(LOCK_AMOUNT);
      expect(await mockToken.balanceOf(await htlc.getAddress())).to.equal(0);

      // Check swap state
      const swap = await htlc.getSwapData(swapId);
      expect(swap.claimed).to.be.true;
      expect(swap.preimage).to.equal(SECRET);
    });

    it("Should revert when claiming with wrong preimage", async function () {
      const wrongSecret = "0x" + "b".repeat(64); // Different 32-byte value
      
      await expect(
        htlc.connect(bob).claimFunds(swapId, wrongSecret)
      ).to.be.revertedWithCustomError(htlc, "InvalidPreimage");
    });

    it("Should revert when non-recipient tries to claim", async function () {
      await expect(
        htlc.connect(charlie).claimFunds(swapId, SECRET)
      ).to.be.revertedWithCustomError(htlc, "UnauthorizedClaim");
    });

    it("Should revert when claiming after timelock expiry", async function () {
      // Fast forward past timelock
      await time.increase(ONE_DAY + 1);
      
      await expect(
        htlc.connect(bob).claimFunds(swapId, SECRET)
      ).to.be.revertedWithCustomError(htlc, "TimelockExpired");
    });

    it("Should revert when claiming already claimed swap", async function () {
      // First claim
      await htlc.connect(bob).claimFunds(swapId, SECRET);
      
      // Try to claim again
      await expect(
        htlc.connect(bob).claimFunds(swapId, SECRET)
      ).to.be.revertedWithCustomError(htlc, "SwapAlreadyCompleted");
    });
  });

  describe("Refund Funds", function () {
    let swapId: string;
    let timelock: number;

    beforeEach(async function () {
      timelock = (await time.latest()) + ONE_DAY;
      
      // Lock tokens
      await mockToken.connect(alice).approve(await htlc.getAddress(), LOCK_AMOUNT);
      const tx = await htlc.connect(alice).lockFunds(
        await bob.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      swapId = event.args.swapId;
    });

    it("Should refund funds after timelock expiry", async function () {
      // Fast forward past timelock
      await time.increase(ONE_DAY + 1);
      
      const aliceBalanceBefore = await mockToken.balanceOf(await alice.getAddress());
      
      await expect(
        htlc.connect(alice).refundFunds(swapId)
      ).to.emit(htlc, "FundsRefunded")
        .withArgs(swapId, await alice.getAddress(), LOCK_AMOUNT);

      // Check balances
      const aliceBalanceAfter = await mockToken.balanceOf(await alice.getAddress());
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(LOCK_AMOUNT);
      expect(await mockToken.balanceOf(await htlc.getAddress())).to.equal(0);

      // Check swap state
      const swap = await htlc.getSwapData(swapId);
      expect(swap.refunded).to.be.true;
    });

    it("Should revert when refunding before timelock expiry", async function () {
      await expect(
        htlc.connect(alice).refundFunds(swapId)
      ).to.be.revertedWithCustomError(htlc, "TimelockNotExpired");
    });

    it("Should revert when non-sender tries to refund", async function () {
      await time.increase(ONE_DAY + 1);
      
      await expect(
        htlc.connect(bob).refundFunds(swapId)
      ).to.be.revertedWithCustomError(htlc, "UnauthorizedRefund");
    });

    it("Should revert when refunding already claimed swap", async function () {
      // Claim first
      await htlc.connect(bob).claimFunds(swapId, SECRET);
      
      // Fast forward past timelock
      await time.increase(ONE_DAY + 1);
      
      // Try to refund
      await expect(
        htlc.connect(alice).refundFunds(swapId)
      ).to.be.revertedWithCustomError(htlc, "SwapAlreadyCompleted");
    });
  });

  describe("ETH Operations", function () {
    let ethSwapId: string;

    beforeEach(async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Lock ETH
      const tx = await htlc.connect(alice).lockETH(
        await bob.getAddress(),
        HASHLOCK,
        timelock,
        { value: ETH_LOCK_AMOUNT }
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      ethSwapId = event.args.swapId;
    });

    it("Should claim ETH successfully", async function () {
      const bobBalanceBefore = await ethers.provider.getBalance(bob.getAddress());
      
      const tx = await htlc.connect(bob).claimFunds(ethSwapId, SECRET);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const bobBalanceAfter = await ethers.provider.getBalance(bob.getAddress());
      
      // Account for gas costs in the balance check
      expect(bobBalanceAfter - bobBalanceBefore + gasUsed).to.equal(ETH_LOCK_AMOUNT);
      expect(await ethers.provider.getBalance(await htlc.getAddress())).to.equal(0);
    });

    it("Should refund ETH successfully", async function () {
      // Fast forward past timelock
      await time.increase(ONE_DAY + 1);
      
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.getAddress());
      
      const tx = await htlc.connect(alice).refundFunds(ethSwapId);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.getAddress());
      
      // Account for gas costs
      expect(aliceBalanceAfter - aliceBalanceBefore + gasUsed).to.equal(ETH_LOCK_AMOUNT);
      expect(await ethers.provider.getBalance(await htlc.getAddress())).to.equal(0);
    });
  });

  describe("Utility Functions", function () {
    it("Should get user swaps", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Create multiple swaps
      await mockToken.connect(alice).approve(await htlc.getAddress(), LOCK_AMOUNT * 2n);
      
      await htlc.connect(alice).lockFunds(
        await bob.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      
      await htlc.connect(alice).lockFunds(
        await charlie.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      
      const userSwaps = await htlc.getUserSwaps(await alice.getAddress());
      expect(userSwaps.length).to.equal(2);
    });

    it("Should check swap existence", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      await mockToken.connect(alice).approve(await htlc.getAddress(), LOCK_AMOUNT);
      const tx = await htlc.connect(alice).lockFunds(
        await bob.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      const swapId = event.args.swapId;
      
      expect(await htlc.swapExists(swapId)).to.be.true;
      expect(await htlc.swapExists(ethers.ZeroHash)).to.be.false;
    });

    it("Should get current time", async function () {
      const contractTime = await htlc.getCurrentTime();
      const blockTime = await time.latest();
      
      expect(contractTime).to.be.closeTo(blockTime, 5); // Within 5 seconds
    });

    it("Should get contract balances", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Lock tokens
      await mockToken.connect(alice).approve(htlc.getAddress(), LOCK_AMOUNT);
      await htlc.connect(alice).lockFunds(
        bob.getAddress(),
        mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      
      // Lock ETH
      await htlc.connect(alice).lockETH(
        await bob.getAddress(),
        HASHLOCK,
        timelock,
        { value: ETH_LOCK_AMOUNT }
      );
      
      expect(await htlc.getContractBalance()).to.equal(ETH_LOCK_AMOUNT);
      expect(await htlc.getTokenBalance(await mockToken.getAddress())).to.equal(LOCK_AMOUNT);
    });
  });

  describe("Error Cases", function () {
    it("Should revert when getting data for non-existent swap", async function () {
      await expect(
        htlc.getSwapData(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(htlc, "SwapNotFound");
    });

    it("Should handle insufficient token allowance", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Don't approve tokens
      await expect(
        htlc.connect(alice).lockFunds(
          bob.getAddress(),
          mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
        )
      ).to.be.reverted; // ERC20 transfer will revert
    });
  });

  describe("Gas Usage", function () {
    it("Should measure gas usage for operations", async function () {
      const timelock = (await time.latest()) + ONE_DAY;
      
      // Lock funds
      await mockToken.connect(alice).approve(await htlc.getAddress(), LOCK_AMOUNT);
      const lockTx = await htlc.connect(alice).lockFunds(
        await bob.getAddress(),
        await mockToken.getAddress(),
        LOCK_AMOUNT,
        HASHLOCK,
        timelock
      );
      const lockReceipt = await lockTx.wait();
      console.log(`Lock gas used: ${lockReceipt.gasUsed}`);
      
      // Get swap ID
      const event = lockReceipt.logs.find((log: any) => log.fragment?.name === "FundsLocked");
      const swapId = event.args.swapId;
      
      // Claim funds
      const claimTx = await htlc.connect(bob).claimFunds(swapId, SECRET);
      const claimReceipt = await claimTx.wait();
      console.log(`Claim gas used: ${claimReceipt.gasUsed}`);
      
      // Verify reasonable gas usage
      expect(lockReceipt.gasUsed).to.be.lessThan(200000);
      expect(claimReceipt.gasUsed).to.be.lessThan(150000);
    });
  });
});
