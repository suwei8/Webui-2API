import os

def patch():
    path = "src/gemini.js"
    with open(path, 'r') as f:
        content = f.read()
    
    # Original problematic block part
    target = """            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
            return true;"""
            
    # Replacement
    replacement = """            // Disabled check removed for idle state (empty input = disabled button)
            return true;"""
            
    if target in content:
        new_content = content.replace(target, replacement)
        with open(path, 'w') as f:
            f.write(new_content)
        print("Patched gemini.js successfully.")
    else:
        print("Target string not found for patching.")
        # Fallback: Print content snippet
        print("Snippet around waitForFunction:")
        start = content.find("await page.waitForFunction")
        print(content[start:start+400])

if __name__ == "__main__":
    patch()
