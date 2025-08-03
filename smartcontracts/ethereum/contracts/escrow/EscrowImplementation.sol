// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IEscrow.sol";

/**
 * @title EscrowImplementation
 * @dev Implementation contract for minimal escrow proxies
 * @notice This contract handles atomic swap escrows with hash-time locks
 */
contract EscrowImplementation is IEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Storage slots
    address private _token;
    uint256 private _amount;
    bytes32 private _hashlock;
    uint256 private _timelock;
    address private _maker;
    address private _taker;
    bool private _withdrawn;
    bool private _refunded;
    bytes32 private _revealedSecret;
    bool private _initialized;
    bool private _funded;

    // Events
    event FundsDeposited(address indexed depositor, uint256 amount);
    event FundsWithdrawn(address indexed recipient, bytes32 preimage, uint256 amount);
    event FundsRefunded(address indexed refundee, uint256 amount);

    // Errors
    error AlreadyInitialized();
    error NotInitialized();
    error AlreadyCompleted();
    error InvalidPreimage();
    error TimelockNotExpired();
    error TimelockExpired();
    error UnauthorizedWithdraw();
    error UnauthorizedRefund();
    error TransferFailed();

    /**
     * @dev Initialize the escrow with parameters
     */
    function initialize(
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external payable {
        if (_initialized) revert AlreadyInitialized();
        
        _token = token;
        _amount = amount;
        _hashlock = hashlock;
        _timelock = timelock;
        _maker = maker;
        _taker = taker;
        _initialized = true;
        
        // If this is for ETH, expect ETH to be sent
        if (token == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
            emit FundsDeposited(msg.sender, msg.value);
        } else {
            // For ERC20 tokens, transfer from sender
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            emit FundsDeposited(msg.sender, amount);
        }
    }

    /**
     * @dev Initialize the escrow without funding (funds transferred separately)
     */
    function initializeWithoutFunding(
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker
    ) external {
        if (_initialized) revert AlreadyInitialized();
        
        _token = token;
        _amount = amount;
        _hashlock = hashlock;
        _timelock = timelock;
        _maker = maker;
        _taker = taker;
        _initialized = true;
        _funded = false;
        
        // No funding happens during initialization
    }

    /**
     * @dev Fund the escrow (called after initialization)
     */
    function fund(uint256 amount) external payable {
        if (!_initialized) revert NotInitialized();
        require(amount == _amount, "Incorrect funding amount");
        require(!_funded, "Already funded");
        
        if (_token == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
            emit FundsDeposited(msg.sender, msg.value);
        } else {
            // For ERC20 tokens, transfer from sender
            IERC20(_token).safeTransferFrom(msg.sender, address(this), amount);
            emit FundsDeposited(msg.sender, amount);
        }
        
        _funded = true;
    }

    /**
     * @dev Mark escrow as funded when tokens are transferred directly
     */
    function markAsFunded() external {
        if (!_initialized) revert NotInitialized();
        require(!_funded, "Already funded");
        
        if (_token == address(0)) {
            require(address(this).balance >= _amount, "Insufficient ETH balance");
        } else {
            require(IERC20(_token).balanceOf(address(this)) >= _amount, "Insufficient token balance");
        }
        
        _funded = true;
        emit FundsDeposited(msg.sender, _amount);
    }

    /**
     * @dev Withdraw funds by revealing preimage
     * @param preimage The secret that hashes to hashlock
     */
    function withdraw(bytes32 preimage) external override nonReentrant {
        if (!_initialized) revert NotInitialized();
        require(_funded, "Escrow not funded");
        if (_withdrawn || _refunded) revert AlreadyCompleted();
        if (block.timestamp >= _timelock) revert TimelockExpired();
        if (sha256(abi.encodePacked(preimage)) != _hashlock) revert InvalidPreimage();
        if (msg.sender != _taker) revert UnauthorizedWithdraw();

        _withdrawn = true;
        _revealedSecret = preimage;

        // Transfer funds to taker
        if (_token == address(0)) {
            (bool success, ) = payable(_taker).call{value: _amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(_token).safeTransfer(_taker, _amount);
        }

        emit FundsWithdrawn(_taker, preimage, _amount);
    }

    /**
     * @dev Refund funds after timelock expiry
     */
    function refund() external override nonReentrant {
        if (!_initialized) revert NotInitialized();
        require(_funded, "Escrow not funded");
        if (_withdrawn || _refunded) revert AlreadyCompleted();
        if (block.timestamp < _timelock) revert TimelockNotExpired();
        
        // Allow both maker and taker to initiate refund
        if (msg.sender != _maker && msg.sender != _taker) {
            revert UnauthorizedRefund();
        }

        _refunded = true;

        // Refund to the maker (who funded this escrow)
        address refundRecipient = _maker;
        
        if (_token == address(0)) {
            (bool success, ) = payable(refundRecipient).call{value: _amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(_token).safeTransfer(refundRecipient, _amount);
        }

        emit FundsRefunded(refundRecipient, _amount);
    }

    /**
     * @dev Get escrow state
     */
    function getState() external view override returns (
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        address maker,
        address taker,
        bool withdrawn,
        bool refunded
    ) {
        return (
            _token,
            _amount,
            _hashlock,
            _timelock,
            _maker,
            _taker,
            _withdrawn,
            _refunded
        );
    }

    /**
     * @dev Get revealed secret (if completed)
     */
    function getRevealedSecret() external view override returns (bytes32) {
        return _revealedSecret;
    }

    /**
     * @dev Check if escrow can be withdrawn
     */
    function canWithdraw() external view returns (bool) {
        return _initialized && 
               !_withdrawn && 
               !_refunded && 
               block.timestamp < _timelock;
    }

    /**
     * @dev Check if escrow can be refunded
     */
    function canRefund() external view returns (bool) {
        return _initialized && 
               !_withdrawn && 
               !_refunded && 
               block.timestamp >= _timelock;
    }

    /**
     * @dev Get current escrow status
     */
    function getStatus() external view returns (
        bool initialized,
        bool withdrawn,
        bool refunded,
        uint256 timeRemaining,
        bool canBeWithdrawn,
        bool canBeRefunded
    ) {
        initialized = _initialized;
        withdrawn = _withdrawn;
        refunded = _refunded;
        
        if (block.timestamp >= _timelock) {
            timeRemaining = 0;
        } else {
            timeRemaining = _timelock - block.timestamp;
        }
        
        canBeWithdrawn = this.canWithdraw();
        canBeRefunded = this.canRefund();
    }

    /**
     * @dev Emergency function to recover stuck tokens (only if not initialized properly)
     */
    function emergencyRecover(address token, address to) external {
        require(!_initialized, "Cannot recover from initialized escrow");
        require(msg.sender == _maker || msg.sender == _taker, "Unauthorized");
        
        if (token == address(0)) {
            payable(to).transfer(address(this).balance);
        } else {
            IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
        }
    }

    /**
     * @dev Receive ETH for initialization
     */
    receive() external payable {
        // ETH received during initialization
    }
}
