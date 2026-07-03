import subprocess

def run_command(command_args):
    """
    Safely execute a shell command by using array passing and shell=False.
    Resolves Issue #16: Prevent Command Injection.
    """
    if not isinstance(command_args, list):
        raise ValueError("Command arguments must be a list to prevent injection.")
        
    try:
        result = subprocess.run(
            command_args,
            shell=False, # Explicitly disabled to prevent injection
            capture_output=True,
            text=True,
            check=True
        )
        return {
            "status": "success",
            "stdout": result.stdout.strip()
        }
    except subprocess.CalledProcessError as e:
        return {
            "status": "error",
            "stderr": e.stderr.strip(),
            "code": e.returncode
        }
