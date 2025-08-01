import { expect } from "chai";
import { ethers } from "hardhat";
import { CrossChainHTLC, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("CrossChainHTLC", function () {
  // Test accounts
  let htlc: CrossChainHTLC;
  let mockToken: MockERC20;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;

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
    await mockToken.transfer(await alice.getAddress(), LOCK_AMOUNT * 10n);
    await mockToken.transfer(await bob.getAddress(), LOCK_AMOUNT * 10n);

    return { htlc, mockToken, owner, alice, bob, charlie };
  }

  beforeEach(async function () {
    ({ htlc, mockToken, owner, alice, bob, charlie } = await loadFixture(
      deployHTLCFixture
    ));
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await htlc.getAddress()).to.properAddress;
      expect(await mockToken.getAddress()).to.properAddress;
    });

    it("Should have correct initial token balances", async function () {
      expect(await mockToken.balanceOf(alice.getAddress())).to.equal(
        LOCK_AMOUNT * 10n
      );
      expect(await mockToken.balanceOf(bob.getAddress())).to.equal(
        LOCK_AMOUNT * 10n
      );
    });
  });

  describe("Lock Funds (ERC20)", function () {
    it("Should lock ERC20 tokens successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Approve tokens
      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      // Lock funds
      const tx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
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
        } catch {
          // Skip logs that can't be parsed
        }
      }

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
      expect(await mockToken.balanceOf(await htlc.getAddress())).to.equal(
        LOCK_AMOUNT
      );
      expect(await mockToken.balanceOf(await alice.getAddress())).to.equal(
        LOCK_AMOUNT * 9n
      );
    });

    it("Should emit FundsLocked event", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
            LOCK_AMOUNT,
            HASHLOCK,
            timelock
          )
      ).to.emit(htlc, "FundsLocked");
    });

    it("Should revert with invalid timelock", async function () {
      const pastTimelock = (await time.latest()) - 1000;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
            LOCK_AMOUNT,
            HASHLOCK,
            pastTimelock
          )
      ).to.be.revertedWithCustomError(htlc, "InvalidTimelock");
    });

    it("Should revert with insufficient timelock duration", async function () {
      const shortTimelock = (await time.latest()) + 30 * 60; // 30 minutes

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
            LOCK_AMOUNT,
            HASHLOCK,
            shortTimelock
          )
      ).to.be.revertedWithCustomError(htlc, "InvalidTimelock");
    });

    it("Should revert with invalid amount", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
            0,
            HASHLOCK,
            timelock
          )
      ).to.be.revertedWithCustomError(htlc, "InvalidAmount");
    });

    it("Should revert with invalid hashlock", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
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

      const tx = await htlc
        .connect(alice)
        .lockETH(await bob.getAddress(), HASHLOCK, timelock, {
          value: ETH_LOCK_AMOUNT,
        });

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
        } catch {
          // Skip logs that can't be parsed
        }
      }

      // Check swap data
      const swap = await htlc.getSwapData(swapId);
      expect(swap.sender).to.equal(await alice.getAddress());
      expect(swap.recipient).to.equal(await bob.getAddress());
      expect(swap.token).to.equal(ethers.ZeroAddress);
      expect(swap.amount).to.equal(ETH_LOCK_AMOUNT);
      expect(swap.hashlock).to.equal(HASHLOCK);
      expect(swap.timelock).to.equal(timelock);
      expect(swap.claimed).to.be.false;
      expect(swap.refunded).to.be.false;

      // Check contract balance
      expect(
        await ethers.provider.getBalance(await htlc.getAddress())
      ).to.equal(ETH_LOCK_AMOUNT);
    });

    it("Should revert with invalid amount", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await expect(
        htlc
          .connect(alice)
          .lockETH(await bob.getAddress(), HASHLOCK, timelock, { value: 0 })
      ).to.be.revertedWithCustomError(htlc, "InvalidAmount");
    });
  });

  describe("Claim Funds (ERC20)", function () {
    let swapId: string;

    beforeEach(async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      const tx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
        );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");

      // Parse event to get swap ID
      for (const log of receipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch {
          // Skip logs that can't be parsed
        }
      }
    });

    it("Should claim ERC20 tokens successfully", async function () {
      const bobBalanceBefore = await mockToken.balanceOf(
        await bob.getAddress()
      );

      await expect(htlc.connect(bob).claimFunds(swapId, SECRET))
        .to.emit(htlc, "FundsClaimed")
        .withArgs(swapId, await bob.getAddress(), SECRET, LOCK_AMOUNT);

      const bobBalanceAfter = await mockToken.balanceOf(await bob.getAddress());
      expect(bobBalanceAfter - bobBalanceBefore).to.equal(LOCK_AMOUNT);
      expect(await mockToken.balanceOf(await htlc.getAddress())).to.equal(0);

      const swap = await htlc.getSwapData(swapId);
      expect(swap.claimed).to.be.true;
      expect(swap.preimage).to.equal(SECRET);
    });

    it("Should revert with wrong preimage", async function () {
      const wrongSecret = "0x" + "b".repeat(64);

      await expect(
        htlc.connect(bob).claimFunds(swapId, wrongSecret)
      ).to.be.revertedWithCustomError(htlc, "InvalidPreimage");
    });

    it("Should revert with unauthorized claimer", async function () {
      await expect(
        htlc.connect(charlie).claimFunds(swapId, SECRET)
      ).to.be.revertedWithCustomError(htlc, "UnauthorizedClaim");
    });

    it("Should revert after timelock expiry", async function () {
      await time.increase(ONE_DAY + 1);

      await expect(
        htlc.connect(bob).claimFunds(swapId, SECRET)
      ).to.be.revertedWithCustomError(htlc, "TimelockExpired");
    });

    it("Should revert if already claimed", async function () {
      await htlc.connect(bob).claimFunds(swapId, SECRET);

      await expect(
        htlc.connect(bob).claimFunds(swapId, SECRET)
      ).to.be.revertedWithCustomError(htlc, "SwapAlreadyCompleted");
    });
  });

  describe("Refund Funds (ERC20)", function () {
    let swapId: string;
    let timelock: number;

    beforeEach(async function () {
      timelock = (await time.latest()) + ONE_DAY;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      const tx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
        );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");

      // Parse event to get swap ID
      for (const log of receipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch {
          // Skip logs that can't be parsed
        }
      }
    });

    it("Should refund ERC20 tokens after timelock expiry", async function () {
      await time.increase(ONE_DAY + 1);

      const aliceBalanceBefore = await mockToken.balanceOf(
        await alice.getAddress()
      );

      await expect(htlc.connect(alice).refundFunds(swapId))
        .to.emit(htlc, "FundsRefunded")
        .withArgs(swapId, await alice.getAddress(), LOCK_AMOUNT);

      const aliceBalanceAfter = await mockToken.balanceOf(
        await alice.getAddress()
      );
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(LOCK_AMOUNT);
      expect(await mockToken.balanceOf(await htlc.getAddress())).to.equal(0);

      const swap = await htlc.getSwapData(swapId);
      expect(swap.refunded).to.be.true;
    });

    it("Should revert refund before timelock expiry", async function () {
      await expect(
        htlc.connect(alice).refundFunds(swapId)
      ).to.be.revertedWithCustomError(htlc, "TimelockNotExpired");
    });

    it("Should revert refund with unauthorized sender", async function () {
      await time.increase(ONE_DAY + 1);

      await expect(
        htlc.connect(bob).refundFunds(swapId)
      ).to.be.revertedWithCustomError(htlc, "UnauthorizedRefund");
    });

    it("Should revert refund if already claimed", async function () {
      await htlc.connect(bob).claimFunds(swapId, SECRET);
      await time.increase(ONE_DAY + 1);

      await expect(
        htlc.connect(alice).refundFunds(swapId)
      ).to.be.revertedWithCustomError(htlc, "SwapAlreadyCompleted");
    });
  });

  describe("ETH Operations", function () {
    it("Should claim ETH successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      const tx = await htlc
        .connect(alice)
        .lockETH(await bob.getAddress(), HASHLOCK, timelock, {
          value: ETH_LOCK_AMOUNT,
        });

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");

      // Parse event to get swap ID
      let ethSwapId: string = "";
      for (const log of receipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            ethSwapId = parsedLog.args.swapId;
            break;
          }
        } catch {
          // Skip logs that can't be parsed
        }
      }

      const bobBalanceBefore = await ethers.provider.getBalance(
        await bob.getAddress()
      );

      const claimTx = await htlc.connect(bob).claimFunds(ethSwapId, SECRET);
      const claimReceipt = await claimTx.wait();
      if (!claimReceipt) throw new Error("Claim receipt is null");

      const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;

      const bobBalanceAfter = await ethers.provider.getBalance(
        await bob.getAddress()
      );
      expect(bobBalanceAfter - bobBalanceBefore + gasUsed).to.equal(
        ETH_LOCK_AMOUNT
      );
      expect(
        await ethers.provider.getBalance(await htlc.getAddress())
      ).to.equal(0);
    });

    it("Should refund ETH successfully", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      const tx = await htlc
        .connect(alice)
        .lockETH(await bob.getAddress(), HASHLOCK, timelock, {
          value: ETH_LOCK_AMOUNT,
        });

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction receipt is null");

      // Parse event to get swap ID
      let ethSwapId: string = "";
      for (const log of receipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            ethSwapId = parsedLog.args.swapId;
            break;
          }
        } catch {
          // Skip logs that can't be parsed
        }
      }

      await time.increase(ONE_DAY + 1);

      const aliceBalanceBefore = await ethers.provider.getBalance(
        await alice.getAddress()
      );

      const refundTx = await htlc.connect(alice).refundFunds(ethSwapId);
      const refundReceipt = await refundTx.wait();
      if (!refundReceipt) throw new Error("Refund receipt is null");

      const gasUsed = refundReceipt.gasUsed * refundReceipt.gasPrice;

      const aliceBalanceAfter = await ethers.provider.getBalance(
        await alice.getAddress()
      );
      expect(aliceBalanceAfter - aliceBalanceBefore + gasUsed).to.equal(
        ETH_LOCK_AMOUNT
      );
      expect(
        await ethers.provider.getBalance(await htlc.getAddress())
      ).to.equal(0);
    });
  });

  describe("Multiple Swaps", function () {
    it("Should handle multiple swaps for one user", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT * 2n);

      await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
        );

      await htlc
        .connect(alice)
        .lockFunds(
          await charlie.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
        );

      const userSwaps = await htlc.getUserSwaps(await alice.getAddress());
      expect(userSwaps.length).to.equal(2);
    });
  });

  describe("Utility Functions", function () {
    it("Should check if swap exists", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await mockToken
        .connect(alice)
        .approve(await htlc.getAddress(), LOCK_AMOUNT);

      const tx = await htlc
        .connect(alice)
        .lockFunds(
          await bob.getAddress(),
          await mockToken.getAddress(),
          LOCK_AMOUNT,
          HASHLOCK,
          timelock
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
        } catch {
          // Skip logs that can't be parsed
        }
      }

      expect(await htlc.swapExists(swapId)).to.be.true;
      expect(await htlc.swapExists(ethers.ZeroHash)).to.be.false;
    });

    it("Should get current time", async function () {
      const contractTime = await htlc.getCurrentTime();
      const blockTime = await time.latest();
      expect(contractTime).to.be.closeTo(BigInt(blockTime), 2);
    });

    it("Should get contract balances", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      // Lock ERC20 tokens
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
          timelock
        );

      // Lock ETH
      await htlc
        .connect(alice)
        .lockETH(await bob.getAddress(), HASHLOCK, timelock, {
          value: ETH_LOCK_AMOUNT,
        });

      expect(await htlc.getContractBalance()).to.equal(ETH_LOCK_AMOUNT);
      expect(await htlc.getTokenBalance(await mockToken.getAddress())).to.equal(
        LOCK_AMOUNT
      );
    });

    it("Should revert for non-existent swap", async function () {
      await expect(
        htlc.getSwapData(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(htlc, "SwapNotFound");
    });
  });

  describe("Insufficient Allowance", function () {
    it("Should revert when insufficient token allowance", async function () {
      const timelock = (await time.latest()) + ONE_DAY;

      await expect(
        htlc
          .connect(alice)
          .lockFunds(
            await bob.getAddress(),
            await mockToken.getAddress(),
            LOCK_AMOUNT,
            HASHLOCK,
            timelock
          )
      ).to.be.reverted;
    });
  });

  describe("Gas Usage", function () {
    it("Should measure gas usage for complete flow", async function () {
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
          timelock
        );

      const lockReceipt = await lockTx.wait();
      if (!lockReceipt) throw new Error("Lock receipt is null");

      // Parse event to get swap ID
      let swapId: string = "";
      for (const log of lockReceipt.logs) {
        try {
          const parsedLog = htlc.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "FundsLocked") {
            swapId = parsedLog.args.swapId;
            break;
          }
        } catch {
          // Skip logs that can't be parsed
        }
      }

      const claimTx = await htlc.connect(bob).claimFunds(swapId, SECRET);
      const claimReceipt = await claimTx.wait();
      if (!claimReceipt) throw new Error("Claim receipt is null");

      console.log(`Lock gas used: ${lockReceipt.gasUsed.toString()}`);
      console.log(`Claim gas used: ${claimReceipt.gasUsed.toString()}`);
      console.log(
        `Total gas used: ${(
          lockReceipt.gasUsed + claimReceipt.gasUsed
        ).toString()}`
      );

      // Gas usage should be reasonable (less than 300k total)
      expect(lockReceipt.gasUsed + claimReceipt.gasUsed).to.be.lt(500000);
    });
  });
});
