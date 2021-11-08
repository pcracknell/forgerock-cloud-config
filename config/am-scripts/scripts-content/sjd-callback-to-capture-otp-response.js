var NodeOutcome = {
  CORRECT: "correct",
  INCORRECT: "incorrect",
  RESEND: "resend",
  ERROR: "error"
};

var ConfirmIndex = {
  RESEND: 0,
  NEXT: 1
}

var config = {
  otpSharedStateVariable: "oneTimePassword",
  linkFragment: "resendOTP",
  submitButton: "loginButton_0",
  nodeName: "checkOrResendOTP"
};

var fr = JavaImporter(
  org.forgerock.openam.auth.node.api.Action,
  javax.security.auth.callback.TextOutputCallback,
  javax.security.auth.callback.PasswordCallback,
  com.sun.identity.authentication.callbacks.HiddenValueCallback,
  com.sun.identity.authentication.callbacks.ScriptTextOutputCallback,
  javax.security.auth.callback.ConfirmationCallback,
  java.lang.String
)

function tag(message) {
  return "SJD ***".concat(config.nodeName).concat(" ").concat(message);
}

var phoneNumber = "";
var emailAddress = "";
var notificationId = transientState.get("notificationId");
var mfaRoute = sharedState.get("mfa-route");
var otpError = transientState.get("error");

logger.error("[LOGIN MFA CALLBACK] Found OTP Error : " + otpError);

try {
  var userId = sharedState.get("_id");

  if (mfaRoute === "sms") {
    if (idRepository.getAttribute(userId, "telephoneNumber").iterator().hasNext()) {
      phoneNumber = idRepository.getAttribute(userId, "telephoneNumber").iterator().next();
      logger.error("[LOGIN MFA CALLBACK] phoneNumber : " + phoneNumber);
    } else {
      logger.error("[LOGIN MFA CALLBACK] Couldn't find telephoneNumber");
      // TODO Better handling of error
    }
  } else if (mfaRoute === "email") {
    var isChangeEmail = sharedState.get("isChangeEmail");
    if (isChangeEmail) {
      emailAddress = sharedState.get("newEmail");
      logger.error("[LOGIN MFA CALLBACK] emailAddress from change email journey: " + emailAddress);
    } else {
      if (idRepository.getAttribute(userId, "mail").iterator().hasNext()) {
        emailAddress = idRepository.getAttribute(userId, "mail").iterator().next();
        logger.error("[LOGIN MFA CALLBACK] emailAddress : " + emailAddress);
      } else {
        logger.error("[LOGIN MFA CALLBACK] Couldn't find emailAddress");
        // TODO Better handling of error
      }
    }
  } else {
    logger.error("[LOGIN MFA CALLBACK] Couldn't determine route used for sending MFA code");
  }
} catch (e) {
  logger.error("[LOGIN MFA CALLBACK] Error retrieving user details: " + e);
}

if (callbacks.isEmpty()) {
  var message = "";
  if (mfaRoute === "sms") {
    message = "Please check your phone";
  } else if (mfaRoute === "email") {
    message = "Please check your email";
  }

  action = fr.Action.send(
    new fr.HiddenValueCallback(
      "pagePropsJSON",
      JSON.stringify({ "phoneNumber": phoneNumber, "emailAddress": emailAddress, "type": mfaRoute })
    ),
    new fr.TextOutputCallback(
      fr.TextOutputCallback.INFORMATION,
      message
    ),
    new fr.HiddenValueCallback(
      "notificationId",
      notificationId
    ),
    new fr.PasswordCallback("Security Code", false),
    new fr.ConfirmationCallback(
      "Do you want to resend?",
      fr.ConfirmationCallback.INFORMATION,
      ["RESEND", "NEXT"],
      1)
  ).build()
} else {

  resend = "false";
  var confirmIndex = callbacks.get(4).getSelectedIndex();
  if (confirmIndex === ConfirmIndex.RESEND) {
    resend = "true";
  }

  var otp = fr.String(callbacks.get(3).getPassword());
  var correctOtp = sharedState.get(config.otpSharedStateVariable);

  logger.message(tag("Resend = " + resend + ', correctOtp = ' + correctOtp));

  if (resend === "true") {
    logger.message(tag("Resend requested"));
    outcome = NodeOutcome.RESEND;
  }
  else if (!correctOtp) {
    logger.error(tag("No OTP in shared state"));
    outcome = NodeOutcome.ERROR;
  }
  else if (!otp.equals(correctOtp)) {
    logger.message(tag("Incorrect OTP"));
    outcome = NodeOutcome.INCORRECT;
  }
  else {
    logger.message(tag("Correct OTP"));
    outcome = NodeOutcome.CORRECT;
  }

}