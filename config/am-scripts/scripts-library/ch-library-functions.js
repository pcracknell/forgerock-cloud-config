/* Add any useful library functions here ...

If the following commented tags are found in a script, the contents of this file
will be merged between the tags, replacing anything already there.

The reason that the contents are merged rather than replaced is because if the server-side script happens
to be pasted back into this project file it will safely be replaced with the latest version of the library code when
it is next deployed.

// LIBRARY START
// LIBRARY END

It is also recommended that a global var called "_scriptName" is declared so that logging can be refined per-script.

Note that comments in this file will be removed as part of the JS minification at point of merge.
*/

function _getScriptNameForDisplay () {
    return _scriptName ? "[" + _scriptName + "]" : "";
}

function _log (message) {
    logger.error("[CHLOG]".concat(_getScriptNameForDisplay()).concat(" ").concat(message));
}

function _getSelectedLanguage (requestHeaders) {
    var langHeader = "Chosen-Language";

    if (requestHeaders && requestHeaders.get(langHeader)) {
        var lang = requestHeaders.get(langHeader).get(0);
        _log("Selected language: " + lang);
        return lang;
    }
    _log("No selected language found - defaulting to EN");
    return "EN";
}

function _obfuscateEmail (email) {
    if (!email || email.replace(/\s/g, "").length === 0 || email.replace(/\s/g, "").indexOf("@") <= 0) {
        return email;
    }

    email = email.replace(/\s/g, "");

    var at = email.indexOf("@");
    var username = email.substring(0, at).trim();
    var domain = email.substring(at + 1).trim();

    return username.substring(0, 1).concat("*****@").concat(domain);
}

function _obfuscatePhone (phone) {
    var NUM_CHARS_TO_SHOW = 4;

    if (!phone || phone.replace(/\s/g, "").length < NUM_CHARS_TO_SHOW) {
        return phone;
    }

    phone = phone.replace(/\s/g, "");

    var buffer = "";
    for (var i = 0; i < phone.length - NUM_CHARS_TO_SHOW; i++) {
        buffer = buffer + "*";
    }

    buffer = buffer + phone.substring(phone.length - NUM_CHARS_TO_SHOW);

    if (buffer.length > 6) {
        buffer = buffer.substring(0, 5).concat(" ") + buffer.substring(5);
    }

    if (buffer.length > 9) {
        buffer = buffer.substring(0, 9).concat(" ") + buffer.substring(9);
    }

    return buffer;
}