var _scriptName = 'CH PASSWORD RESET CONFIRMATION EMAIL SENT';
_log('Starting');

var fr = JavaImporter(
  org.forgerock.openam.auth.node.api.Action,
  javax.security.auth.callback.TextOutputCallback,
  com.sun.identity.authentication.callbacks.HiddenValueCallback
);

var email = sharedState.get('objectAttributes').get('mail');
var notificationId = transientState.get('notificationId');
_log('mail : ' + email);

if (callbacks.isEmpty()) {
  action = fr.Action.send(
    new fr.TextOutputCallback(
      fr.TextOutputCallback.INFORMATION,
      'Check your email to reset the password - ' + email
    ),
    new fr.HiddenValueCallback(
      'stage',
      'RESET_PASSWORD_6'
    ),
    new fr.HiddenValueCallback(
      'pagePropsJSON',
      JSON.stringify({ 'email': email })
    ),
    new fr.HiddenValueCallback(
      'notificationId',
      notificationId
    )
  ).build();
} else {
  outcome = 'true';
}

_log('Outcome = ' + _getOutcomeForDisplay());

// LIBRARY START
// LIBRARY END