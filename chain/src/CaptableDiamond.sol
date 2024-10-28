// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../lib/diamond-3-hardhat/contracts/Diamond.sol";
import "./facets/CAPAccessControlFacet.sol";
import {StockLib, Issuer} from "./lib/StockLib.sol";

contract CapTableDiamond is CAPAccessControlFacet {
    function initialize(bytes16 id, uint256 initial_shares_authorized, address admin) external {
        _grantRole(ADMIN_ROLE, admin);
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);

        StockLib._s().issuer = Issuer(id, 0, initial_shares_authorized);
        emit StockLib.IssuerCreated(id);
    }
}
