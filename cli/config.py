def prompt_config():
    """
    Interactive prompt for CLI configuration setup.
    Resolves Issue #14: CLI Configuration Capabilities with Interactive Prompts.
    """
    print("Welcome to Kairo CLI Configuration Wizard!")
    
    api_key = input("Enter your API Key [leave blank for default]: ").strip()
    if not api_key:
        api_key = "default_api_key_001"
        
    environment = input("Enter environment (dev/prod) [default: dev]: ").strip()
    if environment not in ["dev", "prod"]:
        environment = "dev"
        
    print(f"Configuration saved safely! Environment: {environment}")
    
    return {
        "api_key": api_key,
        "environment": environment
    }
