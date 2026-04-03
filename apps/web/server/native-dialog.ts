import { execFile } from "node:child_process";
import { platform } from "node:os";

/**
 * Opens a native OS folder-picker dialog and returns the selected absolute path.
 * Returns null when the user cancels. Throws on unsupported platform or tool missing.
 */
export function selectDirectory(): Promise<string | null> {
  const os = platform();

  switch (os) {
    case "darwin":
      return macosDialog();
    case "linux":
      return linuxDialog();
    case "win32":
      return windowsDialog();
    default:
      return Promise.reject(
        new Error(`Unsupported platform: ${os}. Native folder picker is not available.`),
      );
  }
}

function exec(cmd: string, args: string[]): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: 300_000 }, (err, stdout) => {
      if (err && "code" in err && typeof err.code === "number") {
        resolve({ stdout: stdout?.trim() ?? "", code: err.code });
        return;
      }
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout: stdout?.trim() ?? "", code: 0 });
    });
    // Detach so the server process doesn't hang if dialog is orphaned
    child.unref?.();
  });
}

async function macosDialog(): Promise<string | null> {
  const script = `
    set chosenFolder to choose folder with prompt "Select Project Directory"
    return POSIX path of chosenFolder
  `;
  const { stdout, code } = await exec("osascript", ["-e", script]);
  // osascript exits with code 1 when user clicks Cancel
  if (code === 1 || !stdout) return null;
  return stdout.replace(/\/$/, ""); // strip trailing slash
}

async function linuxDialog(): Promise<string | null> {
  // Check zenity is available
  try {
    await exec("which", ["zenity"]);
  } catch {
    throw new Error(
      "zenity is required for folder selection on Linux. Install it with: sudo apt install zenity",
    );
  }

  const { stdout, code } = await exec("zenity", [
    "--file-selection",
    "--directory",
    "--title=Select Project Directory",
  ]);
  // zenity exits with code 1 when user clicks Cancel
  if (code === 1 || !stdout) return null;
  return stdout;
}

async function windowsDialog(): Promise<string | null> {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Select Project Directory"
    $result = $dialog.ShowDialog()
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
      Write-Output $dialog.SelectedPath
    }
  `;

  let result: { stdout: string; code: number | null };
  try {
    result = await exec("powershell", ["-NoProfile", "-Command", psScript]);
  } catch (err) {
    throw new Error(
      `PowerShell folder picker failed. Ensure PowerShell is available and execution policy allows scripts. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!result.stdout) return null;
  return result.stdout;
}
