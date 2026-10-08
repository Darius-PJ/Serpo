Option Explicit
Dim shell, files, root, command, arg, code
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & root & "\scripts\launchSerpoHidden.ps1"""
For Each arg In WScript.Arguments
  If InStr(arg, Chr(34)) > 0 Then WScript.Quit 1
  command = command & " """ & arg & """"
Next
' Window style 0 hides the launcher and its console from the beginning.
code = shell.Run(command, 0, True)
' Exit 2 means the native startup window already displayed the failure.
If code <> 0 And code <> 2 Then
  MsgBox "Serpo could not start. See " & shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Serpo\launcher.log for details.", 16, "Serpo"
End If
WScript.Quit code
