// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CrossChainHTLC
 * @dev Hash Time-Locked Contract for cross-chain atomic swaps
 * @notice This contract enables trustless atomic swaps between Ethereum and other chains
 */
contract CrossChainHTLC is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Counter for generating unique swap IDs
    uint256 private _swapIdCounter;

    /**
     * @dev Swap struct containing all swap details
     */
    struct Swap {
        bytes32 id;              // Unique swap identifier
        address sender;          // Address that locked the funds
        address recipient;       // Address that can claim the funds
        address token;           // Token contract address (address(0) for ETH)
        uint256 amount;          // Amount of tokens locked
        bytes32 hashlock;        // SHA-256 hash of the secret
        uint256 timelock;        // UNIX timestamp after which refund is possible
        bool claimed;            // Whether funds have been claimed
        bool refunded;           // Whether funds have been refunded
        bytes32 preimage;        // The revealed secret (set when claimed)
        uint256 createdAt;       // Timestamp when swap was created
    }

    // Mapping from swap ID to swap details
    mapping(bytes32 => Swap) public swaps;
    
    // Mapping to track user's active swaps
    mapping(address => bytes32[]) public userSwaps;

    /**
     * @dev Events
     */
    event FundsLocked(
        bytes32 indexed swapId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );

    event FundsClaimed(
        bytes32 indexed swapId,
        address indexed recipient,
        bytes32 preimage,
        uint256 amount
    );

    event FundsRefunded(
        bytes32 indexed swapId,
        address indexed sender,
        uint256 amount
    );

    /**
     * @dev Custom errors for gas efficiency
     */
    error SwapAlreadyExists();
    error SwapNotFound();
    error SwapAlreadyCompleted();
    error InvalidTimelock();
    error InvalidHashlock();
    error InvalidAmount();
    error UnauthorizedClaim();
    error UnauthorizedRefund();
    error InvalidPreimage();
    error TimelockNotExpired();
    error TimelockExpired();
    error InsufficientETH();

    /**
     * @dev Creates a new HTLC swap for ERC20 tokens
     * @param recipient Address that can claim the funds
     * @param token ERC20 token contract address
     * @param amount Amount of tokens to lock
     * @param hashlock SHA-256 hash of the secret
     * @param timelock UNIX timestamp after which refund is possible
     * @return swapId The unique identifier for this swap
     */
    function lockFunds(
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    ) external nonReentrant returns (bytes32 swapId) {
        if (recipient == address(0)) revert InvalidAmount();
        if (amount == 0) revert InvalidAmount();
        if (hashlock == bytes32(0)) revert InvalidHashlock();
        if (timelock <= block.timestamp) revert InvalidTimelock();
        if (timelock <= block.timestamp + 1 hours) revert InvalidTimelock(); // Minimum 1 hour timelock

        // Generate unique swap ID
        _swapIdCounter++;
        swapId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            token,
            amount,
            hashlock,
            timelock,
            block.timestamp,
            _swapIdCounter
        ));

        if (swaps[swapId].sender != address(0)) revert SwapAlreadyExists();

        // Transfer tokens to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Create swap
        swaps[swapId] = Swap({
            id: swapId,
            sender: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            hashlock: hashlock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            preimage: bytes32(0),
            createdAt: block.timestamp
        });

        // Track user's swaps
        userSwaps[msg.sender].push(swapId);

        emit FundsLocked(swapId, msg.sender, recipient, token, amount, hashlock, timelock);
        return swapId;
    }

    /**
     * @dev Creates a new HTLC swap for ETH
     * @param recipient Address that can claim the funds
     * @param hashlock SHA-256 hash of the secret
     * @param timelock UNIX timestamp after which refund is possible
     * @return swapId The unique identifier for this swap
     */
    function lockETH(
        address recipient,
        bytes32 hashlock,
        uint256 timelock
    ) external payable nonReentrant returns (bytes32 swapId) {
        if (recipient == address(0)) revert InvalidAmount();
        if (msg.value == 0) revert InvalidAmount();
        if (hashlock == bytes32(0)) revert InvalidHashlock();
        if (timelock <= block.timestamp) revert InvalidTimelock();
        if (timelock <= block.timestamp + 1 hours) revert InvalidTimelock();

        // Generate unique swap ID
        _swapIdCounter++;
        swapId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            address(0), // ETH
            msg.value,
            hashlock,
            timelock,
            block.timestamp,
            _swapIdCounter
        ));

        if (swaps[swapId].sender != address(0)) revert SwapAlreadyExists();

        // Create swap
        swaps[swapId] = Swap({
            id: swapId,
            sender: msg.sender,
            recipient: recipient,
            token: address(0), // ETH
            amount: msg.value,
            hashlock: hashlock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            preimage: bytes32(0),
            createdAt: block.timestamp
        });

        // Track user's swaps
        userSwaps[msg.sender].push(swapId);

        emit FundsLocked(swapId, msg.sender, recipient, address(0), msg.value, hashlock, timelock);
        return swapId;
    }

    /**
     * @dev Claims the locked funds by revealing the preimage
     * @param swapId The swap identifier
     * @param preimage The secret that hashes to the hashlock
     */
    function claimFunds(bytes32 swapId, bytes32 preimage) external nonReentrant {
        Swap storage swap = swaps[swapId];
        
        if (swap.sender == address(0)) revert SwapNotFound();
        if (swap.claimed || swap.refunded) revert SwapAlreadyCompleted();
        if (block.timestamp >= swap.timelock) revert TimelockExpired();
        if (sha256(abi.encodePacked(preimage)) != swap.hashlock) revert InvalidPreimage();
        
        // Only recipient can claim
        if (msg.sender != swap.recipient) revert UnauthorizedClaim();

        // Mark as claimed and store preimage
        swap.claimed = true;
        swap.preimage = preimage;

        // Transfer funds
        if (swap.token == address(0)) {
            // Transfer ETH
            (bool success, ) = payable(swap.recipient).call{value: swap.amount}("");
            if (!success) revert InsufficientETH();
        } else {
            // Transfer ERC20 tokens
            IERC20(swap.token).safeTransfer(swap.recipient, swap.amount);
        }

        emit FundsClaimed(swapId, swap.recipient, preimage, swap.amount);
    }

    /**
     * @dev Refunds the locked funds after timelock expiry
     * @param swapId The swap identifier
     */
    function refundFunds(bytes32 swapId) external nonReentrant {
        Swap storage swap = swaps[swapId];
        
        if (swap.sender == address(0)) revert SwapNotFound();
        if (swap.claimed || swap.refunded) revert SwapAlreadyCompleted();
        if (block.timestamp < swap.timelock) revert TimelockNotExpired();
        
        // Only sender can refund
        if (msg.sender != swap.sender) revert UnauthorizedRefund();

        // Mark as refunded
        swap.refunded = true;

        // Transfer funds back to sender
        if (swap.token == address(0)) {
            // Transfer ETH
            (bool success, ) = payable(swap.sender).call{value: swap.amount}("");
            if (!success) revert InsufficientETH();
        } else {
            // Transfer ERC20 tokens
            IERC20(swap.token).safeTransfer(swap.sender, swap.amount);
        }

        emit FundsRefunded(swapId, swap.sender, swap.amount);
    }

    /**
     * @dev Gets swap data for monitoring
     * @param swapId The swap identifier
     * @return swap The complete swap data
     */
    function getSwapData(bytes32 swapId) external view returns (Swap memory swap) {
        if (swaps[swapId].sender == address(0)) revert SwapNotFound();
        return swaps[swapId];
    }

    /**
     * @dev Gets all swap IDs for a user
     * @param user The user address
     * @return Array of swap IDs
     */
    function getUserSwaps(address user) external view returns (bytes32[] memory) {
        return userSwaps[user];
    }

    /**
     * @dev Checks if a swap exists
     * @param swapId The swap identifier
     * @return True if swap exists
     */
    function swapExists(bytes32 swapId) external view returns (bool) {
        return swaps[swapId].sender != address(0);
    }

    /**
     * @dev Gets the current block timestamp (for testing)
     * @return Current block timestamp
     */
    function getCurrentTime() external view returns (uint256) {
        return block.timestamp;
    }

    /**
     * @dev Emergency function to check contract balance (view only)
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Gets token balance of contract
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
