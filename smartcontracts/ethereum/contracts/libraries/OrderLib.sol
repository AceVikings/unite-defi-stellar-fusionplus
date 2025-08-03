// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OrderLib
 * @dev Library for order utilities and validation
 */
library OrderLib {
    /**
     * @dev Order structure for Limit Order Protocol compatibility
     */
    struct Order {
        uint256 salt;           // Order salt for extension integrity
        address makerAsset;     // Asset to be swapped by maker
        address takerAsset;     // Asset to be swapped by taker  
        address maker;          // Order creator
        address receiver;       // Funds recipient (can be different from maker)
        address allowedSender;  // Permitted taker (zero for public orders)
        uint256 makingAmount;   // Amount of maker asset
        uint256 takingAmount;   // Amount of taker asset
        uint256 offsets;        // Encoded offsets for makerTraits and extension
        bytes interactions;     // Encoded interactions data
    }

    /**
     * @dev Calculate order hash for signature verification
     * @param order The order to hash
     * @return orderHash The calculated hash
     */
    function hash(Order memory order) internal pure returns (bytes32) {
        return keccak256(abi.encode(
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
    }

    /**
     * @dev Validate order basic parameters
     * @param order The order to validate
     */
    function validateOrder(Order memory order) internal view {
        require(order.maker != address(0), "Invalid maker");
        require(order.makerAsset != order.takerAsset || order.makerAsset == address(0), "Invalid assets");
        require(order.makingAmount > 0, "Invalid making amount");
        require(order.takingAmount > 0, "Invalid taking amount");
        
        // Check expiration if encoded in salt (simplified)
        uint256 expiration = order.salt >> 160;
        if (expiration > 0) {
            require(block.timestamp <= expiration, "Order expired");
        }
    }

    /**
     * @dev Extract extension data from interactions
     * @param order The order containing interactions
     * @return extension The extracted extension data
     */
    function getExtension(Order memory order) internal pure returns (bytes memory) {
        if (order.interactions.length == 0) {
            return "";
        }
        
        // Extract extension offset and length
        uint256 offset = (order.offsets >> 160) & 0xffffffff;
        if (offset >= order.interactions.length) {
            return "";
        }
        
        return _slice(order.interactions, offset, order.interactions.length - offset);
    }

    /**
     * @dev Get maker traits from order
     * @param order The order
     * @return makerTraits The maker traits
     */
    function getMakerTraits(Order memory order) internal pure returns (uint256) {
        return order.offsets & 0x00ffffffffffffffffffffffffffffffffffffffff;
    }

    /**
     * @dev Internal function to slice bytes
     */
    function _slice(bytes memory data, uint256 start, uint256 length) private pure returns (bytes memory) {
        require(start + length <= data.length, "Slice out of bounds");
        
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = data[start + i];
        }
        return result;
    }
}
