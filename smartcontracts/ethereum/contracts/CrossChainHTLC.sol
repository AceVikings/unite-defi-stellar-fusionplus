// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CrossChainHTLC
 * @dev Hash Time-Locked Contract for cross-chain atomic swaps
 * @notice This contract enables trustless atomic swaps between Ethereum and Stellar networks
 * @notice Integrates with 1inch Fusion+ for intent-based cross-chain swaps
 * @author Unite DeFi Team
 * @custom:version 1.0.0
 */
contract CrossChainHTLC is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Version for contract upgrades and compatibility
    string public constant VERSION = "1.0.0";
    
    // Counter for generating unique swap IDs
    uint256 private _swapIdCounter;
    
    // Protocol fee (in basis points, e.g., 30 = 0.3%)
    uint256 public protocolFeeBps = 30;
    
    // Minimum timelock duration (1 hour)
    uint256 public constant MIN_TIMELOCK_DURATION = 1 hours;
    
    // Maximum timelock duration (7 days)
    uint256 public constant MAX_TIMELOCK_DURATION = 7 days;
    
    // Fee recipient address
    address public feeRecipient;

    /**
     * @dev Swap struct containing all swap details
     * @notice Enhanced structure for cross-chain coordination with Stellar
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
        string stellarTxHash;    // Stellar transaction hash for cross-chain reference
        address resolver;        // Resolver address (for 1inch Fusion+ integration)
        uint256 protocolFee;     // Protocol fee amount deducted
        SwapStatus status;       // Current swap status
    }
    
    /**
     * @dev Enum for swap status tracking
     */
    enum SwapStatus {
        PENDING,     // Swap created but not yet active
        ACTIVE,      // Swap is active and can be claimed
        CLAIMED,     // Swap has been successfully claimed
        REFUNDED,    // Swap has been refunded
        EXPIRED      // Swap has expired but not yet refunded
    }
    
    /**
     * @dev Structure for resolver information (1inch Fusion+ integration)
     */
    struct ResolverInfo {
        bool isActive;           // Whether resolver is currently active
        uint256 totalSwaps;      // Total number of swaps facilitated
        uint256 successfulSwaps; // Number of successful swaps
        uint256 collateral;      // Collateral amount deposited
        string reputation;       // IPFS hash of reputation data
    }

    // Mapping from swap ID to swap details
    mapping(bytes32 => Swap) public swaps;
    
    // Mapping to track user's active swaps
    mapping(address => bytes32[]) public userSwaps;
    
    // Mapping to track resolver information
    mapping(address => ResolverInfo) public resolvers;
    
    // Mapping to track approved tokens for swaps
    mapping(address => bool) public approvedTokens;
    
    // Array of all swap IDs for enumeration
    bytes32[] public allSwapIds;
    
    // Statistics tracking
    uint256 public totalSwapsCreated;
    uint256 public totalSwapsClaimed;
    uint256 public totalSwapsRefunded;
    uint256 public totalFeesCollected;

    /**
     * @dev Events for comprehensive monitoring and cross-chain coordination
     */
    event FundsLocked(
        bytes32 indexed swapId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address resolver,
        string stellarTxHash
    );

    event FundsClaimed(
        bytes32 indexed swapId,
        address indexed recipient,
        bytes32 preimage,
        uint256 amount,
        uint256 protocolFee
    );

    event FundsRefunded(
        bytes32 indexed swapId,
        address indexed sender,
        uint256 amount
    );
    
    event ResolverRegistered(
        address indexed resolver,
        uint256 collateral,
        string reputation
    );
    
    event ResolverDeactivated(
        address indexed resolver,
        string reason
    );
    
    event TokenApprovalChanged(
        address indexed token,
        bool approved
    );
    
    event ProtocolFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );
    
    event FeeRecipientUpdated(
        address indexed oldRecipient,
        address indexed newRecipient
    );
    
    event SwapStatusUpdated(
        bytes32 indexed swapId,
        SwapStatus oldStatus,
        SwapStatus newStatus
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
    error TokenNotApproved();
    error ResolverNotActive();
    error InsufficientCollateral();
    error InvalidFeeRecipient();
    error FeeTooHigh();
    error Unauthorized();

    /**
     * @dev Constructor
     * @param _feeRecipient Initial fee recipient address
     */
    constructor(address _feeRecipient) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        feeRecipient = _feeRecipient;
        
        // Approve ETH by default
        approvedTokens[address(0)] = true;
        emit TokenApprovalChanged(address(0), true);
    }

    /**
     * @dev Creates a new HTLC swap for ERC20 tokens
     * @param recipient Address that can claim the funds
     * @param token ERC20 token contract address
     * @param amount Amount of tokens to lock
     * @param hashlock SHA-256 hash of the secret
     * @param timelock UNIX timestamp after which refund is possible
     * @param resolver Address of the resolver facilitating this swap
     * @param stellarTxHash Stellar transaction hash for cross-chain reference
     * @return swapId The unique identifier for this swap
     */
    function lockFunds(
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address resolver,
        string memory stellarTxHash
    ) external nonReentrant returns (bytes32 swapId) {
        if (recipient == address(0)) revert InvalidAmount();
        if (amount == 0) revert InvalidAmount();
        if (hashlock == bytes32(0)) revert InvalidHashlock();
        if (timelock <= block.timestamp + MIN_TIMELOCK_DURATION) revert InvalidTimelock();
        if (timelock > block.timestamp + MAX_TIMELOCK_DURATION) revert InvalidTimelock();
        if (!approvedTokens[token]) revert TokenNotApproved();
        if (resolver != address(0) && !resolvers[resolver].isActive) revert ResolverNotActive();

        // Calculate protocol fee
        uint256 protocolFee = (amount * protocolFeeBps) / 10000;
        uint256 netAmount = amount - protocolFee;

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
        
        // Transfer protocol fee if applicable
        if (protocolFee > 0) {
            IERC20(token).safeTransfer(feeRecipient, protocolFee);
            totalFeesCollected += protocolFee;
        }

        // Create swap
        swaps[swapId] = Swap({
            id: swapId,
            sender: msg.sender,
            recipient: recipient,
            token: token,
            amount: netAmount,
            hashlock: hashlock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            preimage: bytes32(0),
            createdAt: block.timestamp,
            stellarTxHash: stellarTxHash,
            resolver: resolver,
            protocolFee: protocolFee,
            status: SwapStatus.ACTIVE
        });

        // Track user's swaps and global stats
        userSwaps[msg.sender].push(swapId);
        allSwapIds.push(swapId);
        totalSwapsCreated++;
        
        // Update resolver stats
        if (resolver != address(0)) {
            resolvers[resolver].totalSwaps++;
        }

        emit FundsLocked(swapId, msg.sender, recipient, token, netAmount, hashlock, timelock, resolver, stellarTxHash);
        emit SwapStatusUpdated(swapId, SwapStatus.PENDING, SwapStatus.ACTIVE);
        return swapId;
    }

    /**
     * @dev Creates a new HTLC swap for ETH
     * @param recipient Address that can claim the funds
     * @param hashlock SHA-256 hash of the secret
     * @param timelock UNIX timestamp after which refund is possible
     * @param resolver Address of the resolver facilitating this swap
     * @param stellarTxHash Stellar transaction hash for cross-chain reference
     * @return swapId The unique identifier for this swap
     */
    function lockETH(
        address recipient,
        bytes32 hashlock,
        uint256 timelock,
        address resolver,
        string memory stellarTxHash
    ) external payable nonReentrant returns (bytes32 swapId) {
        if (recipient == address(0)) revert InvalidAmount();
        if (msg.value == 0) revert InvalidAmount();
        if (hashlock == bytes32(0)) revert InvalidHashlock();
        if (timelock <= block.timestamp + MIN_TIMELOCK_DURATION) revert InvalidTimelock();
        if (timelock > block.timestamp + MAX_TIMELOCK_DURATION) revert InvalidTimelock();
        if (resolver != address(0) && !resolvers[resolver].isActive) revert ResolverNotActive();

        // Calculate protocol fee
        uint256 protocolFee = (msg.value * protocolFeeBps) / 10000;
        uint256 netAmount = msg.value - protocolFee;

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

        // Transfer protocol fee if applicable
        if (protocolFee > 0) {
            (bool feeSuccess, ) = payable(feeRecipient).call{value: protocolFee}("");
            if (!feeSuccess) revert InsufficientETH();
            totalFeesCollected += protocolFee;
        }

        // Create swap
        swaps[swapId] = Swap({
            id: swapId,
            sender: msg.sender,
            recipient: recipient,
            token: address(0), // ETH
            amount: netAmount,
            hashlock: hashlock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            preimage: bytes32(0),
            createdAt: block.timestamp,
            stellarTxHash: stellarTxHash,
            resolver: resolver,
            protocolFee: protocolFee,
            status: SwapStatus.ACTIVE
        });

        // Track user's swaps and global stats
        userSwaps[msg.sender].push(swapId);
        allSwapIds.push(swapId);
        totalSwapsCreated++;
        
        // Update resolver stats
        if (resolver != address(0)) {
            resolvers[resolver].totalSwaps++;
        }

        emit FundsLocked(swapId, msg.sender, recipient, address(0), netAmount, hashlock, timelock, resolver, stellarTxHash);
        emit SwapStatusUpdated(swapId, SwapStatus.PENDING, SwapStatus.ACTIVE);
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
        swap.status = SwapStatus.CLAIMED;
        
        // Update global stats
        totalSwapsClaimed++;
        
        // Update resolver stats if applicable
        if (swap.resolver != address(0)) {
            resolvers[swap.resolver].successfulSwaps++;
        }

        // Transfer funds
        if (swap.token == address(0)) {
            // Transfer ETH
            (bool success, ) = payable(swap.recipient).call{value: swap.amount}("");
            if (!success) revert InsufficientETH();
        } else {
            // Transfer ERC20 tokens
            IERC20(swap.token).safeTransfer(swap.recipient, swap.amount);
        }

        emit FundsClaimed(swapId, swap.recipient, preimage, swap.amount, swap.protocolFee);
        emit SwapStatusUpdated(swapId, SwapStatus.ACTIVE, SwapStatus.CLAIMED);
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
        swap.status = SwapStatus.REFUNDED;
        
        // Update global stats
        totalSwapsRefunded++;

        // Transfer funds back to sender (protocol fee was already transferred to fee recipient)
        uint256 refundAmount = swap.amount;
        
        if (swap.token == address(0)) {
            // Transfer ETH
            (bool success, ) = payable(swap.sender).call{value: refundAmount}("");
            if (!success) revert InsufficientETH();
        } else {
            // Transfer ERC20 tokens
            IERC20(swap.token).safeTransfer(swap.sender, refundAmount);
        }

        emit FundsRefunded(swapId, swap.sender, refundAmount);
        emit SwapStatusUpdated(swapId, SwapStatus.ACTIVE, SwapStatus.REFUNDED);
    }

    // =============================================================================
    // RESOLVER MANAGEMENT FUNCTIONS (1inch Fusion+ Integration)
    // =============================================================================

    /**
     * @dev Registers a new resolver with collateral
     * @param reputation IPFS hash of reputation data
     */
    function registerResolver(string memory reputation) external payable {
        if (msg.value == 0) revert InsufficientCollateral();
        
        resolvers[msg.sender] = ResolverInfo({
            isActive: true,
            totalSwaps: 0,
            successfulSwaps: 0,
            collateral: msg.value,
            reputation: reputation
        });

        emit ResolverRegistered(msg.sender, msg.value, reputation);
    }

    /**
     * @dev Deactivates a resolver
     * @param resolver Resolver address to deactivate
     * @param reason Reason for deactivation
     */
    function deactivateResolver(address resolver, string memory reason) external onlyOwner {
        resolvers[resolver].isActive = false;
        emit ResolverDeactivated(resolver, reason);
    }

    /**
     * @dev Allows resolver to withdraw collateral after deactivation
     */
    function withdrawResolverCollateral() external nonReentrant {
        ResolverInfo storage info = resolvers[msg.sender];
        if (info.isActive) revert ResolverNotActive();
        if (info.collateral == 0) revert InsufficientCollateral();

        uint256 collateral = info.collateral;
        info.collateral = 0;

        (bool success, ) = payable(msg.sender).call{value: collateral}("");
        if (!success) revert InsufficientETH();
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Updates protocol fee (only owner)
     * @param newFeeBps New fee in basis points
     */
    function updateProtocolFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert FeeTooHigh(); // Max 10%
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(oldFee, newFeeBps);
    }

    /**
     * @dev Updates fee recipient (only owner)
     * @param newRecipient New fee recipient address
     */
    function updateFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidFeeRecipient();
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /**
     * @dev Approves or disapproves a token for swaps
     * @param token Token address (address(0) for ETH)
     * @param approved Whether token is approved
     */
    function setTokenApproval(address token, bool approved) external onlyOwner {
        approvedTokens[token] = approved;
        emit TokenApprovalChanged(token, approved);
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

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
     * @dev Gets resolver information
     * @param resolver The resolver address
     * @return ResolverInfo struct
     */
    function getResolverInfo(address resolver) external view returns (ResolverInfo memory) {
        return resolvers[resolver];
    }

    /**
     * @dev Gets all swap IDs (paginated)
     * @param offset Starting index
     * @param limit Maximum number of results
     * @return Array of swap IDs
     */
    function getAllSwaps(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        if (offset >= allSwapIds.length) {
            return new bytes32[](0);
        }
        
        uint256 end = offset + limit;
        if (end > allSwapIds.length) {
            end = allSwapIds.length;
        }
        
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allSwapIds[i];
        }
        
        return result;
    }

    /**
     * @dev Gets active swaps for a user
     * @param user The user address
     * @return Array of active swap IDs
     */
    function getActiveUserSwaps(address user) external view returns (bytes32[] memory) {
        bytes32[] memory userSwapIds = userSwaps[user];
        uint256 activeCount = 0;
        
        // First pass: count active swaps
        for (uint256 i = 0; i < userSwapIds.length; i++) {
            Swap memory swap = swaps[userSwapIds[i]];
            if (!swap.claimed && !swap.refunded && block.timestamp < swap.timelock) {
                activeCount++;
            }
        }
        
        // Second pass: collect active swaps
        bytes32[] memory activeSwaps = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < userSwapIds.length; i++) {
            Swap memory swap = swaps[userSwapIds[i]];
            if (!swap.claimed && !swap.refunded && block.timestamp < swap.timelock) {
                activeSwaps[index] = userSwapIds[i];
                index++;
            }
        }
        
        return activeSwaps;
    }

    /**
     * @dev Gets contract statistics
     * @return _totalSwapsCreated Total number of swaps created
     * @return _totalSwapsClaimed Total number of swaps claimed
     * @return _totalSwapsRefunded Total number of swaps refunded
     * @return _totalFeesCollected Total protocol fees collected
     * @return _contractETHBalance Current contract ETH balance
     * @return _totalActiveSwaps Total number of active swaps
     */
    function getContractStats() external view returns (
        uint256 _totalSwapsCreated,
        uint256 _totalSwapsClaimed,
        uint256 _totalSwapsRefunded,
        uint256 _totalFeesCollected,
        uint256 _contractETHBalance,
        uint256 _totalActiveSwaps
    ) {
        return (
            totalSwapsCreated,
            totalSwapsClaimed,
            totalSwapsRefunded,
            totalFeesCollected,
            address(this).balance,
            totalSwapsCreated - totalSwapsClaimed - totalSwapsRefunded
        );
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
     * @dev Checks if a swap is claimable
     * @param swapId The swap identifier
     * @return True if swap can be claimed
     */
    function isSwapClaimable(bytes32 swapId) external view returns (bool) {
        Swap memory swap = swaps[swapId];
        return swap.sender != address(0) && 
               !swap.claimed && 
               !swap.refunded && 
               block.timestamp < swap.timelock;
    }

    /**
     * @dev Checks if a swap is refundable
     * @param swapId The swap identifier
     * @return True if swap can be refunded
     */
    function isSwapRefundable(bytes32 swapId) external view returns (bool) {
        Swap memory swap = swaps[swapId];
        return swap.sender != address(0) && 
               !swap.claimed && 
               !swap.refunded && 
               block.timestamp >= swap.timelock;
    }

    /**
     * @dev Gets the current block timestamp (for testing)
     * @return Current block timestamp
     */
    function getCurrentTime() external view returns (uint256) {
        return block.timestamp;
    }

    /**
     * @dev Gets contract ETH balance
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

    /**
     * @dev Checks if a token is approved for swaps
     * @param token Token address
     * @return True if token is approved
     */
    function isTokenApproved(address token) external view returns (bool) {
        return approvedTokens[token];
    }

    /**
     * @dev Batch function to get multiple swap data
     * @param swapIds Array of swap IDs
     * @return Array of swap data
     */
    function getBatchSwapData(bytes32[] memory swapIds) external view returns (Swap[] memory) {
        Swap[] memory swapData = new Swap[](swapIds.length);
        for (uint256 i = 0; i < swapIds.length; i++) {
            if (swaps[swapIds[i]].sender != address(0)) {
                swapData[i] = swaps[swapIds[i]];
            }
        }
        return swapData;
    }

    // =============================================================================
    // EMERGENCY FUNCTIONS
    // =============================================================================

    /**
     * @dev Emergency pause function (only owner)
     * @notice This would require adding Pausable from OpenZeppelin in a full implementation
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            if (!success) revert InsufficientETH();
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    /**
     * @dev Fallback function to receive ETH
     */
    receive() external payable {
        // Allow contract to receive ETH
    }
}
