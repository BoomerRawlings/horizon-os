Option Explicit

Dim shell, fso, dashboard, root, powershell, scriptName, scriptPath, command, arg, i

If WScript.Arguments.Count < 1 Then
  WScript.Quit 1
End If

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dashboard = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(dashboard)
scriptName = WScript.Arguments(0)
scriptPath = fso.BuildPath(dashboard, scriptName)

If Not fso.FileExists(scriptPath) Then
  WScript.Quit 2
End If

powershell = shell.ExpandEnvironmentStrings("%WINDIR%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = """" & powershell & """ -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptPath & """"
For i = 1 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  If InStr(arg, " ") > 0 Or InStr(arg, """") > 0 Or InStr(arg, "&") > 0 Or InStr(arg, "'") > 0 Then
    command = command & " """ & Replace(arg, """", """""") & """"
  Else
    command = command & " " & arg
  End If
Next

shell.CurrentDirectory = root
shell.Run command, 0, False
