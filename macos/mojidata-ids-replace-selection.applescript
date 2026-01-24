-- Quick Action example (Automator > Run AppleScript)
-- Transforms selected text into IDS strings (comma-separated).
--
-- Recommended Automator settings (to avoid Accessibility/UI scripting):
-- - Workflow receives current: "text" in "any application"
-- - Output replaces selected text: ON
--
-- Edit `repoPath` if your mojidata repo is not at ~/ws/mojidata

on run {input, parameters}
	set repoPath to ((POSIX path of (path to home folder)) & "ws/mojidata")
	set scriptPath to repoPath & "/macos/mojidata-ids.zsh"

	if input is missing value then return input
	if (count of input) is 0 then return input

	set selectedText to ""
	try
		set parts to {}
		repeat with x in input
			set end of parts to (x as text)
		end repeat
		set oldDelims to AppleScript's text item delimiters
		set AppleScript's text item delimiters to linefeed
		set selectedText to parts as text
		set AppleScript's text item delimiters to oldDelims
	on error
		try
			set selectedText to (input as text)
		on error
			return input
		end try
	end try

	if selectedText is "" then return input

	set cmd to "/bin/zsh " & quoted form of scriptPath & " --text " & quoted form of selectedText
	try
		set idsText to do shell script cmd
	on error
		return input
	end try
	
	if idsText is "" then return input

	return idsText
end run
