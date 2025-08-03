// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

import "./interfaces/IFusionPlus.sol";
import "./interfaces/IOrderExtension.sol";
import "./interfaces/IEscrow.sol";
import "./libraries/OrderLib.sol";
import "./core/MockLimitOrderProtocol.sol";
import "./escrow/EscrowFactory.sol";
import "./extensions/FusionExtension.sol";
import "./extensions/DutchAuctionCalculator.sol";

/**
 * @title CrossChainFusionPlus
 * @dev 1inch Fusion+ compatible cross-chain atomic swap protocol
 * @notice Enables intent-based cross-chain swaps between Ethereum and Stellar networks
 * @author Unite DeFi Team
 * @custom:version 2.0.0
 */
contract CrossChainFusionPlus is IFusionPlus, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using OrderLib for OrderLib.Order;

    // Version for Fusion+ compatibility
    string public constant VERSION = "2.0.0";
    
    // Domain separator for EIP-712
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // Order typehash for EIP-712
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address makerAsset,address takerAsset,address maker,address receiver,address allowedSender,uint256 makingAmount,uint256 takingAmount,uint256 offsets,bytes interactions)"
    );

    // Protocol components
    MockLimitOrderProtocol public immutable limitOrderProtocol;
    EscrowFactory public immutable escrowFactory;
    FusionExtension public immutable fusionExtension;
    DutchAuctionCalculator public immutable auctionCalculator;
    
    // Protocol fee (in basis points, e.g., 30 = 0.3%)
    uint256 public protocolFeeBps = 30;
    
    // Fee recipient address
    address public feeRecipient;
    
    // Minimum and maximum timelock durations
    uint256 public constant MIN_TIMELOCK_DURATION = 1 hours;
    uint256 public constant MAX_TIMELOCK_DURATION = 7 days;

    /**
     * @dev Cross-chain swap structure combining Fusion+ orders with HTLC
     */
    struct CrossChainSwap {
        bytes32 orderHash;           // Fusion+ order hash
        bytes32 escrowSalt;          // Salt for escrow deployment
        address srcEscrow;           // Source chain escrow address
        address dstEscrow;           // Destination chain escrow address
        bytes32 hashlock;            // HTLC hashlock
        uint256 timelock;            // HTLC timelock
        bool srcCompleted;           // Source chain completion status
        bool dstCompleted;           // Destination chain completion status
        uint256 createdAt;           // Creation timestamp
        string stellarTxHash;        // Stellar transaction reference
        address resolver;            // Resolver facilitating the swap
        SwapStatus status;           // Current swap status
    }

    /**
     * @dev Swap status enumeration
     */
    enum SwapStatus {
        PENDING,        // Swap created, waiting for escrows
        SRC_ESCROWED,   // Source escrow created
        DST_ESCROWED,   // Destination escrow created
        BOTH_ESCROWED,  // Both escrows created
        SRC_CLAIMED,    // Source escrow claimed
        DST_CLAIMED,    // Destination escrow claimed
        COMPLETED,      // Both escrows claimed successfully
        SRC_REFUNDED,   // Source escrow refunded
        DST_REFUNDED,   // Destination escrow refunded
        FAILED          // Swap failed
    }

    /**
     * @dev Resolver information for cross-chain coordination
     */
    struct ResolverInfo {
        bool isActive;              // Whether resolver is active
        uint256 totalSwaps;         // Total number of swaps facilitated
        uint256 successfulSwaps;    // Number of successful swaps
        uint256 collateral;         // Collateral amount deposited
        string reputation;          // IPFS hash of reputation data
        uint256 registeredAt;       // Registration timestamp
    }

    // State mappings
    mapping(bytes32 => CrossChainSwap) public crossChainSwaps;
    mapping(bytes32 => uint256) public orderFilled;
    mapping(bytes32 => bool) public orderCancelled;
    mapping(address => ResolverInfo) public resolvers;
    mapping(address => bytes32[]) public userSwaps;
    mapping(address => bool) public approvedTokens;
    
    // Arrays for enumeration
    bytes32[] public allSwapIds;
    
    // Statistics
    uint256 public totalSwapsCreated;
    uint256 public totalSwapsCompleted;
    uint256 public totalSwapsFailed;
    uint256 public totalFeesCollected;

    /**
     * @dev Events for comprehensive monitoring
     */
    event CrossChainSwapInitiated(
        bytes32 indexed orderHash,
        bytes32 indexed swapId,
        address indexed maker,
        address taker,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        bytes32 hashlock,
        uint256 timelock,
        address resolver
    );

    event EscrowCreated(
        bytes32 indexed swapId,
        bytes32 indexed orderHash,
        address indexed escrow,
        bool isSource,
        address token,
        uint256 amount
    );

    event SwapCompleted(
        bytes32 indexed swapId,
        bytes32 indexed orderHash,
        bytes32 preimage,
        uint256 srcAmount,
        uint256 dstAmount,
        address resolver
    );

    event SwapFailed(
        bytes32 indexed swapId,
        bytes32 indexed orderHash,
        string reason,
        SwapStatus finalStatus
    );

    event ResolverRegistered(
        address indexed resolver,
        uint256 collateral,
        string reputation
    );

    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);

    // Custom errors
    error OrderNotFound();
    error SwapAlreadyExists();
    error SwapNotFound();
    error InvalidOrder();
    error InvalidSignature();
    error InvalidTimelock();
    error InvalidHashlock();
    error UnauthorizedResolver();
    error EscrowCreationFailed();
    error SwapAlreadyCompleted();
    error InsufficientCollateral();
    error TokenNotApproved();

    /**
     * @dev Constructor
     * @param _limitOrderProtocol Address of the Limit Order Protocol
     * @param _escrowFactory Address of the escrow factory
     * @param _fusionExtension Address of the fusion extension
     * @param _auctionCalculator Address of the auction calculator
     * @param _feeRecipient Initial fee recipient address
     */
    constructor(
        address payable _limitOrderProtocol,
        address _escrowFactory,
        address _fusionExtension,
        address _auctionCalculator,
        address _feeRecipient
    ) Ownable(msg.sender) {
        require(_limitOrderProtocol != address(0), "Invalid LOP address");
        require(_escrowFactory != address(0), "Invalid factory address");
        require(_fusionExtension != address(0), "Invalid extension address");
        require(_auctionCalculator != address(0), "Invalid calculator address");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        limitOrderProtocol = MockLimitOrderProtocol(_limitOrderProtocol);
        escrowFactory = EscrowFactory(_escrowFactory);
        fusionExtension = FusionExtension(_fusionExtension);
        auctionCalculator = DutchAuctionCalculator(_auctionCalculator);
        feeRecipient = _feeRecipient;

        // Set up domain separator
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("CrossChainFusionPlus")),
            keccak256(bytes(VERSION)),
            block.chainid,
            address(this)
        ));

        // Approve ETH by default
        approvedTokens[address(0)] = true;
    }

    /**
     * @dev Fill a Fusion+ order and initiate cross-chain swap
     * @param order The Fusion+ order to fill
     * @param signature Signature from the order maker
     * @param makingAmount Amount of maker asset to fill
     * @param takingAmount Amount of taker asset to provide
     * @return actualMakingAmount Actual amount of maker asset filled
     * @return actualTakingAmount Actual amount of taker asset taken
     */
    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        bytes calldata /* interaction */,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* takerTraits */
    ) external payable nonReentrant returns (uint256 actualMakingAmount, uint256 actualTakingAmount) {
        // Validate order
        _validateOrder(order);
        
        // Calculate order hash
        bytes32 orderHash = _hashOrder(order);
        
        // Verify signature
        _verifySignature(order, signature, orderHash);
        
        // Handle token transfers directly
        _executeTokenTransfers(order, makingAmount, takingAmount);
        
        // Check if this is a cross-chain order (has extension)
        if (order.interactions.length > 0) {
            // This is a cross-chain order, create swap structure
            _initiateCrossChainSwap(order, orderHash, order.interactions, makingAmount, takingAmount);
        }
        
        // Mark order as filled
        orderFilled[orderHash] += makingAmount;
        
        return (makingAmount, takingAmount);
    }

    /**
     * @dev Create source chain escrow
     * @param orderHash Hash of the Fusion+ order
     * @param token Token address for escrow
     * @param amount Amount to escrow
     * @param hashlock HTLC hashlock
     * @param timelock HTLC timelock
     * @param maker Order maker address
     * @param taker Order taker address
     * @return escrow Address of created escrow
     */
    function createSrcEscrow(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external payable nonReentrant returns (address escrow) {
        CrossChainSwap storage swap = crossChainSwaps[orderHash];
        require(swap.orderHash != bytes32(0), "Swap not found");
        require(swap.srcEscrow == address(0), "Source escrow already exists");
        require(approvedTokens[token] || token == address(0), "Token not approved");

        // Create escrow via factory (without funding)
        escrow = escrowFactory.createSrcEscrow(
            orderHash,
            token,
            amount,
            hashlock,
            timelock,
            maker,
            taker
        );

        // Fund the escrow
        if (token == address(0)) {
            // For ETH, forward ETH to escrow
            require(msg.value >= amount, "Insufficient ETH");
            IEscrow(escrow).fund{value: amount}(amount);
            // Refund excess ETH
            if (msg.value > amount) {
                payable(msg.sender).transfer(msg.value - amount);
            }
        } else {
            // For ERC20, transfer from user to escrow directly and mark as funded
            IERC20(token).safeTransferFrom(msg.sender, escrow, amount);
            IEscrow(escrow).markAsFunded();
        }

        // Update swap state
        swap.srcEscrow = escrow;
        _updateSwapStatus(orderHash, SwapStatus.SRC_ESCROWED);

        emit EscrowCreated(orderHash, orderHash, escrow, true, token, amount);
        return escrow;
    }

    /**
     * @dev Create destination chain escrow
     * @param orderHash Hash of the Fusion+ order
     * @param token Token address for escrow
     * @param amount Amount to escrow
     * @param hashlock HTLC hashlock
     * @param timelock HTLC timelock
     * @param maker Order maker address
     * @param taker Order taker address
     * @return escrow Address of created escrow
     */
    function createDstEscrow(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external payable nonReentrant returns (address escrow) {
        CrossChainSwap storage swap = crossChainSwaps[orderHash];
        require(swap.orderHash != bytes32(0), "Swap not found");
        require(swap.dstEscrow == address(0), "Destination escrow already exists");
        require(approvedTokens[token] || token == address(0), "Token not approved");

        // Create escrow via factory (without funding)
        escrow = escrowFactory.createDstEscrow(
            orderHash,
            token,
            amount,
            hashlock,
            timelock,
            taker,
            maker
        );

        // Fund the escrow
        if (token == address(0)) {
            // For ETH, forward ETH to escrow
            require(msg.value >= amount, "Insufficient ETH");
            IEscrow(escrow).fund{value: amount}(amount);
            // Refund excess ETH
            if (msg.value > amount) {
                payable(msg.sender).transfer(msg.value - amount);
            }
        } else {
            // For ERC20, transfer from user to escrow directly and mark as funded
            IERC20(token).safeTransferFrom(msg.sender, escrow, amount);
            IEscrow(escrow).markAsFunded();
        }

        // Update swap state
        swap.dstEscrow = escrow;
        _updateSwapStatus(orderHash, SwapStatus.DST_ESCROWED);

        emit EscrowCreated(orderHash, orderHash, escrow, false, token, amount);
        return escrow;
    }

    /**
     * @dev Register as a resolver with collateral
     * @param reputation IPFS hash of reputation data
     */
    function registerResolver(string memory reputation) external payable {
        require(msg.value > 0, "Collateral required");
        require(!resolvers[msg.sender].isActive, "Already registered");

        resolvers[msg.sender] = ResolverInfo({
            isActive: true,
            totalSwaps: 0,
            successfulSwaps: 0,
            collateral: msg.value,
            reputation: reputation,
            registeredAt: block.timestamp
        });

        emit ResolverRegistered(msg.sender, msg.value, reputation);
    }

    // =============================================================================
    // INTERNAL FUNCTIONS
    // =============================================================================

    /**
     * @dev Validate Fusion+ order parameters
     */
    function _validateOrder(Order calldata order) internal view {
        if (order.maker == address(0)) revert InvalidOrder();
        if (order.makingAmount == 0) revert InvalidOrder();
        if (order.takingAmount == 0) revert InvalidOrder();
        if (!approvedTokens[order.makerAsset]) revert TokenNotApproved();
        if (!approvedTokens[order.takerAsset]) revert TokenNotApproved();
    }

    /**
     * @dev Calculate order hash for EIP-712 signature verification
     */
    function _hashOrder(Order calldata order) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            ORDER_TYPEHASH,
            order.salt,
            order.makerAsset,
            order.takerAsset,
            order.maker,
            order.receiver,
            order.allowedSender,
            order.makingAmount,
            order.takingAmount,
            order.offsets,
            keccak256(order.interactions)
        ));
        
        return MessageHashUtils.toTypedDataHash(DOMAIN_SEPARATOR, structHash);
    }

    /**
     * @dev Verify order signature
     */
    function _verifySignature(Order calldata order, bytes calldata signature, bytes32 orderHash) internal view {
        address signer = orderHash.recover(signature);
        
        if (signer != order.maker) {
            // Try contract signature verification (EIP-1271)
            if (order.maker.code.length > 0) {
                require(
                    IERC1271(order.maker).isValidSignature(orderHash, signature) == IERC1271.isValidSignature.selector,
                    "Invalid contract signature"
                );
            } else {
                revert InvalidSignature();
            }
        }
    }

    /**
     * @dev Initiate cross-chain swap from Fusion+ order
     */
    function _initiateCrossChainSwap(
        Order calldata order,
        bytes32 orderHash,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount
    ) internal {
        if (crossChainSwaps[orderHash].orderHash != bytes32(0)) revert SwapAlreadyExists();

        // Decode cross-chain parameters from interaction data
        (bytes32 hashlock, uint256 timelock, string memory stellarTxHash, address resolver) = 
            abi.decode(interaction, (bytes32, uint256, string, address));

        // Validate cross-chain parameters
        if (hashlock == bytes32(0)) revert InvalidHashlock();
        if (timelock <= block.timestamp + MIN_TIMELOCK_DURATION) revert InvalidTimelock();
        if (timelock > block.timestamp + MAX_TIMELOCK_DURATION) revert InvalidTimelock();
        if (!resolvers[resolver].isActive) revert UnauthorizedResolver();

        // Create cross-chain swap structure
        crossChainSwaps[orderHash] = CrossChainSwap({
            orderHash: orderHash,
            escrowSalt: bytes32(0),
            srcEscrow: address(0),
            dstEscrow: address(0),
            hashlock: hashlock,
            timelock: timelock,
            srcCompleted: false,
            dstCompleted: false,
            createdAt: block.timestamp,
            stellarTxHash: stellarTxHash,
            resolver: resolver,
            status: SwapStatus.PENDING
        });

        // Track swap
        userSwaps[order.maker].push(orderHash);
        allSwapIds.push(orderHash);
        totalSwapsCreated++;

        // Update resolver stats
        resolvers[resolver].totalSwaps++;

        emit CrossChainSwapInitiated(
            orderHash,
            orderHash, // Using orderHash as swapId for simplicity
            order.maker,
            msg.sender,
            order.makerAsset,
            order.takerAsset,
            makingAmount,
            takingAmount,
            hashlock,
            timelock,
            resolver
        );
    }

    /**
     * @dev Update swap status and emit event
     */
    function _updateSwapStatus(bytes32 swapId, SwapStatus newStatus) internal {
        SwapStatus oldStatus = crossChainSwaps[swapId].status;
        crossChainSwaps[swapId].status = newStatus;
        
        // Check for completion
        if (newStatus == SwapStatus.DST_ESCROWED && oldStatus == SwapStatus.SRC_ESCROWED) {
            crossChainSwaps[swapId].status = SwapStatus.BOTH_ESCROWED;
        }
    }

    /**
     * @dev Execute token transfers for order filling
     */
    function _executeTokenTransfers(
        Order calldata order,
        uint256 makingAmount,
        uint256 takingAmount
    ) internal {
        address receiver = order.receiver == address(0) ? msg.sender : order.receiver;
        
        // Transfer maker asset from maker to taker (msg.sender)
        if (order.makerAsset == address(0)) {
            // ETH transfer - not supported for maker asset in this implementation
            revert TokenNotApproved();
        } else {
            IERC20(order.makerAsset).safeTransferFrom(order.maker, msg.sender, makingAmount);
        }
        
        // Transfer taker asset from taker (msg.sender) to receiver
        if (order.takerAsset == address(0)) {
            // ETH transfer
            require(msg.value >= takingAmount, "Insufficient ETH");
            (bool success, ) = receiver.call{value: takingAmount}("");
            require(success, "ETH transfer failed");
            
            // Refund excess ETH
            if (msg.value > takingAmount) {
                (success, ) = msg.sender.call{value: msg.value - takingAmount}("");
                require(success, "ETH refund failed");
            }
        } else {
            IERC20(order.takerAsset).safeTransferFrom(msg.sender, receiver, takingAmount);
        }
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Update protocol fee (only owner)
     */
    function updateProtocolFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high"); // Max 10%
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(oldFee, newFeeBps);
    }

    /**
     * @dev Approve or disapprove tokens for swaps
     */
    function setTokenApproval(address token, bool approved) external onlyOwner {
        approvedTokens[token] = approved;
    }

    /**
     * @dev Deactivate a resolver
     */
    function deactivateResolver(address resolver) external onlyOwner {
        resolvers[resolver].isActive = false;
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Get cross-chain swap data
     */
    function getCrossChainSwap(bytes32 swapId) external view returns (CrossChainSwap memory) {
        return crossChainSwaps[swapId];
    }

    /**
     * @dev Get resolver information
     */
    function getResolverInfo(address resolver) external view returns (ResolverInfo memory) {
        return resolvers[resolver];
    }

    /**
     * @dev Get user's swaps
     */
    function getUserSwaps(address user) external view returns (bytes32[] memory) {
        return userSwaps[user];
    }

    /**
     * @dev Get contract statistics
     */
    function getContractStats() external view returns (
        uint256 _totalSwapsCreated,
        uint256 _totalSwapsCompleted,
        uint256 _totalSwapsFailed,
        uint256 _totalFeesCollected
    ) {
        return (totalSwapsCreated, totalSwapsCompleted, totalSwapsFailed, totalFeesCollected);
    }

    /**
     * @dev Check if swap exists
     */
    function swapExists(bytes32 swapId) external view returns (bool) {
        return crossChainSwaps[swapId].orderHash != bytes32(0);
    }
}
