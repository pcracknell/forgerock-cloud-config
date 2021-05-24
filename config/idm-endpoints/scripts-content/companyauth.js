(function () {

    // Configuration

    var OBJECT_USER = "alpha_user";
    var OBJECT_COMPANY = "alpha_organization";
    var USER_RELATIONSHIP = "memberOfOrg";
    var COMPANY_RELATIONSHIP = "members";
    // var INTERNAL_ROLE_MEMBERSHIP_ADMIN = "internal/role/ch-membership-admin";
    var INTERNAL_IDM_ADMIN = "internal/role/openidm-admin";

    // Values for the memberOfOrg/members relationship property "status"

    var AuthorisationStatus = {
        CONFIRMED: "confirmed",
        PENDING: "pending",
        NONE: "none"
    };

    var InviteActions = {
        ACCEPT: "accept",
        DECLINE: "decline"
    };

    // Endpoint actions

    var RequestAction = {
        GET_STATUS_BY_USERNAME: "getCompanyStatusByUsername",
        GET_STATUS_BY_USERID: "getCompanyStatusByUserId",
        INVITE_USER_BY_USERNAME: "inviteUserByUsername",
        INVITE_USER_BY_USERID: "inviteUserByUserId",
        GET_COMPANY: "getCompanyByNumber",
        RESPOND_INVITE: "respondToInvite"
        // GET_COMPANIES: "getCompanies",
        // GET_USER: "getUser",
        // GET_COMPANY: "getCompany"
    };

    // Debug loggers

    function log(message) {
        logger.error("AUTHEND " + message);
    }

    function logResponse(response) {
        log("Got response " + response);
    }

    // Fetch current status for user vs. company
    function getStatus(userId, companyId) {

        var status = AuthorisationStatus.NONE;
        var membership = null;
        var relationshipEntry;

        var response = openidm.query("managed/" + OBJECT_USER + "/" + userId + "/" + USER_RELATIONSHIP,
            { "_queryFilter": "true" },
            ["_refProperties/membershipStatus"]);

        logResponse("IDM User membershipStatus found: " + response);

        if (response.resultCount === 0) {
            log("No companies currently authorised");
        }
        else {
            response.result.forEach(function (entry) {
                // log("Got company " + entry._refResourceId);
                if (entry._refResourceId === companyId) {
                    status = entry._refProperties.membershipStatus;
                    log("Got a match for company " + companyId + ": membership status: " + status);
                    membership = entry._id;
                    relationshipEntry = entry;
                }
            });
        }

        return {
            status: status,
            entry: relationshipEntry,
            membership: membership
        };

    }

    // deletes the relationship between the given user and given copmpany if in PENDING status
    function deleteRelationship(subjectId, companyId) {
        var currentStatusResponse = getStatus(subjectId, companyId);
        if (!currentStatusResponse.status === AuthorisationStatus.PENDING) {
            return {
                success: false,
                message: "The relationship with company " + companyId + " must be in PENDING state to be removed"
            };
        }
        log("Deleting relationship for company " + companyId);
        log("patching: " + "managed/" + OBJECT_USER + "/" + subjectId);

        var payload = [
            {
                operation: "remove",
                field: "/memberOfOrg",
                value: {
                    _ref: currentStatusResponse.entry._ref,
                    _refResourceCollection: currentStatusResponse.entry._refResourceCollection,
                    _refResourceId: currentStatusResponse.entry._refResourceId,
                    _refProperties: currentStatusResponse.entry._refProperties
                }
            }
        ];

        var newObject = openidm.patch("managed/" + OBJECT_USER + "/" + subjectId,
            null,
            payload);

        // check that the relationship has been removed from the user
        if (JSON.stringify(newObject.memberOfOrgIDs).indexOf(currentStatusResponse.entry._refResourceId) > -1) {
            return {
                success: false,
                message: "The relationship with company " + companyId + " could not be removed from the user"
            };
        }

        return {
            success: true
        };

    }

    // Update status for user vs. company
    function setStatus(callerId, subjectId, companyId, newStatus) {

        var currentStatusResponse = getStatus(subjectId, companyId);
        if (currentStatusResponse.status === AuthorisationStatus.NONE) {
            log("Creating new relationship for company " + companyId + " with status " + newStatus);
            openidm.create("managed/" + OBJECT_USER + "/" + subjectId + "/" + USER_RELATIONSHIP,
                null,
                {
                    "_ref": "managed/" + OBJECT_COMPANY + "/" + companyId,
                    "_refProperties": {
                        "membershipStatus": newStatus,
                        "inviterId": callerId,
                        "inviteTimestamp": new Date().toString()
                    }
                });
        }
        else if (currentStatusResponse.status === newStatus) {
            log("Status already " + newStatus);
        } else {
            log("Updating status from " + currentStatusResponse.status + " to " + newStatus + " for company " + companyId);

            var statusUpdate = {
                operation: "replace",
                field: "/_refProperties/membershipStatus",
                value: newStatus
            };

            var inviterUpdate = {
                operation: "replace",
                field: "/_refProperties/inviterId",
                value: callerId
            };

            var inviteTimestampUpdate = {
                operation: "replace",
                field: "/_refProperties/inviteTimestamp",
                value: new Date().toString()
            };

            // update the 'inviterId' and 'inviteTimestamp' relationship property only when an invitation is created, do not override them when invite is accepted
            var newobject = openidm.patch("managed/" + OBJECT_USER + "/" + subjectId + "/" + USER_RELATIONSHIP + "/" + currentStatusResponse.membership,
                null,
                (newStatus === AuthorisationStatus.CONFIRMED) ? [statusUpdate] : [statusUpdate, inviterUpdate, inviteTimestampUpdate]);
        };

        return {
            success: true,
            oldStatus: currentStatusResponse.status
        };
    }

    // Look up a uid from a username
    function getUserByUsername(username) {
        // log("Looking up user " + username);
        var response = openidm.query("managed/" + OBJECT_USER,
            { "_queryFilter": "/userName eq \"" + username + "\"" },
            ["_id", "userName", "givenName"]);

        if (response.resultCount !== 1) {
            log("Bad result count " + response.resultCount);
            return null;
        }

        return response.result[0];
    }

    // Look up a uid from a username
    function getUserById(userId) {
        // log("Looking up user " + userId);
        var response = openidm.query("managed/" + OBJECT_USER,
            { "_queryFilter": "/_id eq \"" + userId + "\"" },
            ["_id", "userName", "givenName", "roles", "authzRoles"]);

        if (response.resultCount !== 1) {
            log("Bad result count " + response.resultCount);
            return null;
        }

        return response.result[0];
    }

    // Look up a company from a company number
    function getCompany(number) {
        // log("Looking up  company " + number);
        var response = openidm.query("managed/" + OBJECT_COMPANY,
            { "_queryFilter": "/number eq \"" + number + "\"" },
            ["_id", "number", "name", "authCode", "status", "members"]);

        if (response.resultCount === 0) {
            log("Bad result count: " + response.resultCount);
            return null;
        }

        return response.result[0];
    }

    // Authorisation logic to allow a user (caller) to accept an invitation to become authorised for a Company
    function allowInviteAcceptance(callerStatus, subjectStatus, newStatus, isCallerAdminUser, isMe) {
        log("ACCEPT INVITE AUTHZ CHECK: callerStatus " + callerStatus + ", subjectStatus " + subjectStatus + ", newStatus " + newStatus + ", isAdminUser " + isCallerAdminUser + ", isMe " + isMe);

        if (subjectStatus === AuthorisationStatus.NONE) {
            return {
                message: "The subject does not have a relationship with the company.",
                allowed: false
            };
        }
        
        if (isCallerAdminUser &&
            subjectStatus === AuthorisationStatus.PENDING &&
            newStatus === AuthorisationStatus.CONFIRMED) {
            log("Caller is admin - changing from '" + subjectStatus + "' to '" + newStatus + "' allowed");
            return {
                allowed: true
            };
        }

        // if caller is also subject, and the current status is PENDING and the target is CONFIRMED
        if (isMe &&
            subjectStatus === AuthorisationStatus.PENDING &&
            newStatus === AuthorisationStatus.CONFIRMED) {
            log("Caller is also subject - changing from '" + subjectStatus + "' to '" + newStatus + "' allowed");
            return {
                allowed: true
            };
        }

        // if caller is authorised, allow subject transition from NONE to PENDING
        if (callerStatus === AuthorisationStatus.CONFIRMED &&
            subjectStatus === AuthorisationStatus.PENDING &&
            newStatus === AuthorisationStatus.CONFIRMED) {
            log("Caller is already authorised - changing subject relationship from PENDING to CONFIRMED: status change allowed");
            return {
                allowed: true
            };
        }

        // if caller is authorised, deny subject transition from PENDING to PENDING
        if (callerStatus === AuthorisationStatus.CONFIRMED &&
            subjectStatus === AuthorisationStatus.CONFIRMED &&
            newStatus === AuthorisationStatus.CONFIRMED) {
            log("Caller is already authorised - subject status for company is already CONFIRMED - Status change allowed");
            return {
                allowed: true
            };
        }

        // for any other combination, deny the request
        return {
            message: "Caller is not authorised for the company, is not an admin or is not the subject.",
            allowed: false
        };
    }

    // Authorisation logic to allow a user (caller) to decline an invitation to become authorised for a Company
    function allowInviteDecline(callerStatus, subjectStatus, isCallerAdminUser, isMe) {
        log("DECLINE INVITE AUTHZ CHECK: callerStatus " + callerStatus + ", subjectStatus " + subjectStatus + ", isAdminUser " + isCallerAdminUser + ", isMe " + isMe);

        if (subjectStatus === AuthorisationStatus.NONE) {
            return {
                message: "The subject does not have a relationship with the company.",
                allowed: false
            };
        }

        if (isCallerAdminUser &&
            subjectStatus === AuthorisationStatus.PENDING) {
            log("Caller is admin - deleting relationship in status '" + subjectStatus + "' allowed");
            return {
                allowed: true
            };
        }

        // if caller is also subject, and the current status is PENDING and the target is CONFIRMED
        if (isMe &&
            subjectStatus === AuthorisationStatus.PENDING) {
            log("Caller is also subject - deleting relationship in status '" + subjectStatus + "' allowed");
            return {
                allowed: true
            };
        }

        // if caller is authorised, allow subject transition from NONE to PENDING
        if (callerStatus === AuthorisationStatus.CONFIRMED &&
            subjectStatus === AuthorisationStatus.PENDING) {
            log("Caller is already authorised - deleting relationship in status PENDING allowed");
            return {
                allowed: true
            };
        }

        // for any other combination, deny the request
        return {
            message: "Caller is not authorised for the company, is not an admin or is not the subject.",
            allowed: false
        };
    }

    // Authorisation logic to allow a user (caller) to send an invite to another user (subject) to become authorised for a Company
    function allowInviteSending(callerStatus, subjectStatus, newStatus, isCallerAdminUser, isMe) {

        log("INVITE AUTHZ CHECK: callerStatus " + callerStatus + " subjectStatus " + subjectStatus + " newStatus " + newStatus + " isAdminUser " + isCallerAdminUser + " isMe " + isMe);

        // if the caller is an admin, allow to invite any user to any company
        if (isCallerAdminUser) {
            log("Caller is admin - changing from '" + subjectStatus + "' to '" + newStatus + "' allowed");
            return {
                allowed: true
            };
        }

        // if caller is authorised, allow subject transition from NONE to PENDING
        if (callerStatus === AuthorisationStatus.CONFIRMED &&
            subjectStatus === AuthorisationStatus.NONE &&
            newStatus === AuthorisationStatus.PENDING) {
            log("Caller is already authorised - changing subject relationship from NONE to PENDING: status change allowed");
            return {
                allowed: true
            };
        }

        // if caller is authorised, allow subject transition from PENDING to PENDING
        if (callerStatus === AuthorisationStatus.CONFIRMED &&
            subjectStatus === AuthorisationStatus.PENDING &&
            newStatus === AuthorisationStatus.PENDING) {
            log("Caller is already authorised - subject status for company is already PENDING - Status change allowed");
            return {
                allowed: true
            };
        }

        // if caller is authorised, deny subject transition from NONE to PENDING
        if (callerStatus === AuthorisationStatus.CONFIRMED &&
            subjectStatus === AuthorisationStatus.CONFIRMED &&
            newStatus === AuthorisationStatus.PENDING) {
            log("Caller is already authorised - subject status for company is already CONFIRMED, cannot set it to PENDING");
            return {
                allowed: false,
                message: "subject status for company is already CONFIRMED, cannot set it to PENDING"
            };
        }

        // for any other combination, deny the request
        return {
            message: "Caller is not authorised for the company, is not an admin, or the state transition is not allowed",
            allowed: false
        };

    }

    // Entrypoint
    log("Incoming request: " + request.content);

    var actor;
    if (request.content.callerId) {
        actor = getUserById(request.content.callerId);
    } else {
        actor = getUserById(context.security.authenticationId);
    }
    log("Caller Id: " + actor._id + "(username: " + actor.userName + ")");

    var isCallerAdminUser = JSON.stringify(actor.authzRoles).indexOf(INTERNAL_IDM_ADMIN) !== -1;
    log("Is Caller an Admin (openidm-admin role): " + isCallerAdminUser);

    if (!request.action) {
        log("No action");
        throw {
            code: 400,
            message: "Bad request - no _action parameter"
        };
    }

    // GET MEMBERSHIP STATUS BY USERNAME AND COMPANY NUMBER
    if (request.action === RequestAction.GET_STATUS_BY_USERNAME) {

        log("Request to read subject company membership status by userName");

        log("Caller Id: " + actor._id + "(username: " + actor.userName + ")");

        if (!request.content.userName || !request.content.companyNumber) {
            log("Invalid parameters - Expected: userName, companyNumber");
            throw {
                code: 400,
                message: "Invalid Parameters - Expected: userName, companyNumber"
            };
        }

        // Authorisation check - must be admin or getting own status
        var subject = getUserByUsername(request.content.userName);
        log("User found: " + subject._id);

        var isMe = (subject._id === actor._id);

        var companyId = getCompany(request.content.companyNumber)._id;
        log("Company found: " + companyId);

        var statusResponse = getStatus(subject._id, companyId);
        log("Membership status: " + JSON.stringify(statusResponse));

        return {
            success: true,
            caller: {
                id: actor._id,
                userName: actor.userName,
                fullName: actor.givenName
            },
            subject: {
                id: subject._id,
                userName: subject.userName,
                fullName: subject.givenName
            },
            company: {
                id: companyId,
                number: request.content.companyNumber,
                status: statusResponse.status
            }
        };
    }
    // GET MEMBERSHIP STATUS BY USERID AND COMPANY NUMBER
    else if (request.action === RequestAction.GET_STATUS_BY_USERID) {

        log("Request to read subject company membership status by userId");

        if (!request.content.userId || !request.content.companyNumber) {
            log("Invalid parameters - Expected: userId, companyNumber");
            throw {
                code: 400,
                message: "Invalid Parameters - Expected: userId, companyNumber"
            };
        }

        // Authorisation check - must be admin or getting own status
        var subject = getUserById(request.content.userId);
        var isMe = (subject._id === actor._id);

        log("User found: " + subject._id);

        var companyId = getCompany(request.content.companyNumber)._id;
        log("Company found: " + companyId);

        var statusResponse = getStatus(subject._id, companyId);
        log("Membership status: " + JSON.stringify(statusResponse));

        return {
            success: true,
            caller: {
                id: actor._id,
                userName: actor.userName,
                fullName: actor.givenName
            },
            subject: {
                id: subject._id,
                userName: subject.userName,
                fullName: subject.givenName
            },
            company: {
                id: companyId,
                number: request.content.companyNumber,
                status: statusResponse.status
            }
        };
    }
    // SET MEMBERSHIP STATUS
    else if (request.action === RequestAction.INVITE_USER_BY_USERID) {

        log("Request to set membership status request to PENDING (send invitation) by userId");

        if (!request.content.subjectId || !request.content.companyNumber) {
            log("Invalid parameters - Expected: subjectId, companyNumber");
            throw {
                code: 400,
                message: "Invalid Parameters - Expected: subjectId, companyNumber"
            };
        }

        // Authorisation check
        var companyId = getCompany(request.content.companyNumber)._id;
        var subject = getUserById(request.content.subjectId);
        var isMe = (subject._id === actor._id);

        var subjectStatus = getStatus(subject._id, companyId).status;
        var callerStatus = (isMe) ? subjectStatus : getStatus(actor._id, companyId).status;
        var newStatus = AuthorisationStatus.PENDING;

        var statusChangeAllowedResult = allowInviteSending(callerStatus, subjectStatus, newStatus, isCallerAdminUser, isMe);
        if (!statusChangeAllowedResult.allowed) {
            log("Blocked status update by user " + actor._id);
            throw {
                code: 403,
                message: "status update denied",
                detail: {
                    reason: statusChangeAllowedResult.message
                }
            };
        }

        var statusResponse;
        try {
            statusResponse = setStatus(actor._id, subject._id, companyId, AuthorisationStatus.PENDING);
        } catch (e) {
            throw {
                code: 400,
                message: "status update denied",
                detail: {
                    reason: statusResponse.message
                }
            };
        }

        return {
            success: statusResponse.success,
            caller: {
                id: actor._id,
                userName: actor.userName,
                fullName: actor.givenName
            },
            subject: {
                id: subject._id,
                userName: subject.userName,
                fullName: subject.givenName
            },
            company: {
                id: companyId,
                number: request.content.companyNumber,
                status: AuthorisationStatus.PENDING,
                previousStatus: statusResponse.oldStatus
            }
        };

    }
    else if (request.action === RequestAction.INVITE_USER_BY_USERNAME) {

        log("Request to set membership status to PENDING (send invitation) by subject userName");

        if (!request.content.subjectUserName || !request.content.companyNumber) {
            log("Invalid parameters - Expected: subjectUserName, companyNumber");
            throw {
                code: 400,
                message: "Invalid Parameters - Expected: subjectUserName, companyNumber"
            };
        }

        // Authorisation check
        var companyId = getCompany(request.content.companyNumber)._id;
        var subject = getUserByUsername(request.content.subjectUserName);
        var isMe = (subject._id === actor._id);

        var subjectStatus = getStatus(subject._id, companyId).status;
        var callerStatus = getStatus(actor._id, companyId).status;
        var newStatus = AuthorisationStatus.PENDING;

        var statusChangeAllowedResult = allowInviteSending(callerStatus, subjectStatus, newStatus, isCallerAdminUser, isMe);
        if (!statusChangeAllowedResult.allowed) {
            log("Blocked status update by user " + actor._id);
            throw {
                code: 403,
                message: "status update denied",
                detail: {
                    reason: statusChangeAllowedResult.message
                }
            };
        }

        var statusResponse;
        try {
            statusResponse = setStatus(actor._id, subject._id, companyId, AuthorisationStatus.PENDING);
        } catch (e) {
            throw {
                code: 400,
                message: "status update denied",
                detail: {
                    reason: statusResponse.message
                }
            };
        }

        return {
            success: statusResponse.success,
            caller: {
                id: actor._id,
                userName: actor.userName,
                fullName: actor.givenName
            },
            subject: {
                id: subject._id,
                userName: subject.userName,
                fullName: subject.givenName
            },
            company: {
                id: companyId,
                number: request.content.companyNumber,
                status: AuthorisationStatus.PENDING,
                previousStatus: statusResponse.oldStatus
            }
        };

    }
    else if (request.action === RequestAction.GET_COMPANY) {

        log("Request to get company data");

        if (!request.content.companyNumber) {
            log("Invalid parameters - Expected: companyNumber");
            throw {
                code: 400,
                message: "Invalid Parameters - Expected: companyNumber"
            };
        }

        var companyData = getCompany(request.content.companyNumber);
        if (!companyData) {
            return {
                success: false,
                message: "The company with number " + request.content.companyNumber + " could not be found."
            };
        }

        if (companyData.authCode == null) {
            return {
                success: false,
                message: "No auth code associated with company " + request.content.companyNumber
            };
        }

        if (companyData.status !== "active") {
            return {
                success: false,
                message: "The company " + request.content.companyNumber + " is not active."
            };
        }

        return {
            success: true,
            caller: {
                id: actor._id,
                userName: actor.userName,
                fullName: actor.givenName
            },
            company: companyData
        };
    }
    else if (request.action === RequestAction.RESPOND_INVITE) {

        log("Request to respond to an invite (accept/decline)");

        if (!request.content.subjectId || !request.content.companyNumber || !request.content.action) {
            log("Invalid parameters - Expected: subjectId, companyNumber, action");
            throw {
                code: 400,
                message: "Invalid Parameters - Expected: subjectId, companyNumber, action"
            };
        }

        if (request.content.action !== InviteActions.ACCEPT && request.content.action !== InviteActions.DECLINE) {
            log("Invalid parameters - The actions allowed on an invitation can only be 'accept' or 'decline'");
            throw {
                code: 400,
                message: "Invalid Parameters - The actions allowed on an invitation can only be 'accept' or 'decline'"
            };
        }

        // Authorisation check
        var companyId = getCompany(request.content.companyNumber)._id;
        var subject = getUserById(request.content.subjectId);
        var isMe = (subject._id === actor._id);

        var subjectStatus = getStatus(subject._id, companyId).status;
        var callerStatus = getStatus(actor._id, companyId).status;

        if (request.content.action === InviteActions.ACCEPT) {
            var newStatus = AuthorisationStatus.CONFIRMED;

            log("Request to set membership status to CONFIRMED (accept invite)");
            var statusChangeAllowedResult = allowInviteAcceptance(callerStatus, subjectStatus, newStatus, isCallerAdminUser, isMe);
            if (!statusChangeAllowedResult.allowed) {
                log("Blocked status update by user " + actor._id);
                throw {
                    code: 403,
                    message: "status update denied",
                    detail: {
                        reason: statusChangeAllowedResult.message
                    }
                };
            }

            var statusResponse = setStatus(actor._id, subject._id, companyId, AuthorisationStatus.CONFIRMED);
            if (!statusResponse || !statusResponse.success) {
                throw {
                    code: 400,
                    message: "An error occurred while accepting/declining the invite",
                    detail: {
                        reason: statusChangeAllowedResult.message
                    }
                };
            }

            return {
                success: statusResponse.success,
                caller: {
                    id: actor._id,
                    userName: actor.userName,
                    fullName: actor.givenName
                },
                subject: {
                    id: subject._id,
                    userName: subject.userName,
                    fullName: subject.givenName
                },
                company: {
                    id: companyId,
                    number: request.content.companyNumber,
                    status: AuthorisationStatus.CONFIRMED,
                    previousStatus: statusResponse.oldStatus
                }
            };

        } else {
            log("Request to delete PENDING company membership (decline invite)");
            var statusChangeAllowedResult = allowInviteDecline(callerStatus, subjectStatus, isCallerAdminUser, isMe);
            if (!statusChangeAllowedResult.allowed) {
                log("Blocked status update by user " + actor._id);
                throw {
                    code: 403,
                    message: "relationship deletion denied",
                    detail: {
                        reason: statusChangeAllowedResult.message
                    }
                };
            }

            var deleteRelationshipResult = deleteRelationship(subject._id, companyId);
            if (!deleteRelationshipResult || !deleteRelationshipResult.success) {
                throw {
                    code: 400,
                    message: "An error occurred while deleting the relationship",
                    detail: {
                        reason: deleteRelationshipResult.message
                    }
                };
            }

            return {
                success: deleteRelationshipResult.success,
                caller: {
                    id: actor._id,
                    userName: actor.userName,
                    fullName: actor.givenName
                },
                subject: {
                    id: subject._id,
                    userName: subject.userName,
                    fullName: subject.givenName
                },
                company: {
                    id: companyId,
                    number: request.content.companyNumber,
                    status: AuthorisationStatus.NONE,
                    previousStatus: subjectStatus
                }
            }
        }
    }
    else {
        throw {
            code: 400,
            message: "Unknown action " + request.action
        };
    }
})();
