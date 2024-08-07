pragma solidity ^0.8.0;

import {AccessControl} from "solidstate-solidity/access/access_control/AccessControl.sol";

bytes32 constant ADMIN_ROLE = keccak256("ADMIN");
bytes32 constant OPERATOR_ROLE = keccak256("OPERATOR");

abstract contract CAPAccessControlFacet is AccessControl {
    modifier onlyAdmin() {
        require(_isAdmin(), "Does not have admin role");
        _;
    }

    /* Role Based Access Control */
    modifier onlyOperator() {
        /// @notice Admins are also considered Operators
        require(_hasRole(OPERATOR_ROLE, msg.sender) || _isAdmin(), "Does not have operator role");
        _;
    }

    function _isAdmin() internal view returns (bool) {
        return _hasRole(ADMIN_ROLE, msg.sender);
    }

    function addAdmin(address addr) external onlyAdmin {
        _grantRole(ADMIN_ROLE, addr);
    }

    function removeAdmin(address addr) external onlyAdmin {
        _revokeRole(ADMIN_ROLE, addr);
    }

    function addOperator(address addr) external onlyAdmin {
        _grantRole(OPERATOR_ROLE, addr);
    }

    function removeOperator(address addr) external onlyAdmin {
        _revokeRole(OPERATOR_ROLE, addr);
    }
}
