# MCP Zephyr West Context Server

A Model Context Protocol (MCP) server for analyzing Zephyr RTOS and West workspace directories. This server provides structured information about embedded development projects using Zephyr, making it easier for AI assistants to understand and work with firmware projects.

## Features

- **West Workspace Analysis**: Validates and analyzes West-managed Zephyr workspaces
- **Version Detection**: Extracts Zephyr RTOS and SDK versions (including Nordic Connect SDK)
- **Component Discovery**: Finds and catalogs modules, boards, and projects
- **Build System Information**: Identifies Kconfig files, CMake modules, and toolchain configurations
- **Manifest Parsing**: Reads West manifest files to understand project structure
- **Kconfig Verification**: Verify if Kconfig options are available before implementation (NEW!)

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- A Zephyr/West workspace to analyze

## Installation

Install the package globally using npm:

```bash
npm install -g mcp-zephyr
```

Or install locally in your project:

```bash
npm install mcp-zephyr
```

## Setup for Claude Desktop

### Option 1: Using Claude MCP CLI (Recommended)

After installing the package globally, add it to Claude Desktop:

```bash
# First install globally
npm install -g mcp-zephyr

# Then add to Claude MCP
claude mcp add mcp-zephyr mcp-zephyr
```

Or if you prefer to use npx without global installation:

```bash
claude mcp add mcp-zephyr "npx mcp-zephyr"
```

### Option 2: Manual Configuration

To manually configure this MCP server with Claude Desktop:

1. Open your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add the MCP Zephyr server to the `mcpServers` section:

**If installed globally:**
```json
{
  "mcpServers": {
    "mcp-zephyr": {
      "command": "mcp-zephyr",
      "env": {}
    }
  }
}
```

**If installed locally:**
```json
{
  "mcpServers": {
    "mcp-zephyr": {
      "command": "npx",
      "args": ["mcp-zephyr"],
      "env": {}
    }
  }
}
```

3. Restart Claude Desktop for the changes to take effect.

## Available Tools

Once configured, the following tools will be available in Claude:

### `analyze_workspace`
Performs a complete analysis of a West workspace directory.

**Parameters:**
- `path` (string): Path to the West workspace directory (containing .west folder)
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** Comprehensive analysis including version info, modules, boards, and build configuration.

### `get_zephyr_version`
Extracts the Zephyr RTOS version from a workspace.

**Parameters:**
- `path` (string): Path to the West workspace directory
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** Version information including major, minor, patch, and full version string.

### `list_modules`
Lists all modules discovered in the workspace.

**Parameters:**
- `path` (string): Path to the West workspace directory
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** List of modules with their paths, categories, and capabilities (CMake/Kconfig support).

### `get_manifest_info`
Retrieves and parses the West manifest information.

**Parameters:**
- `path` (string): Path to the West workspace directory
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** Manifest details including remotes, projects, and defaults.

### `list_boards`
Finds all available hardware boards in the workspace.

**Parameters:**
- `path` (string): Path to the West workspace directory
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** List of boards grouped by architecture or vendor.

### `get_build_info`
Gets build system information including CMake and Kconfig files.

**Parameters:**
- `path` (string): Path to the West workspace directory
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** Lists of Kconfig files, CMake modules, and toolchain configurations.

### `verify_kconfigs` ⭐ NEW
Verifies if specified Kconfig options are available in the workspace before implementation. This prevents coding against non-existent configurations and provides alternatives and suggestions.

**Parameters:**
- `path` (string): Path to the West workspace directory
- `kconfigs` (array): List of Kconfig option names to verify (e.g., ["BT_PERIPHERAL", "BT_NUS", "BT_AUDIO"])
- `westPath` (string, optional): Custom path to the .west directory (defaults to path/.west)

**Returns:** Comprehensive verification report including:
- ✅ Available configs with source files, descriptions, and dependencies  
- ❌ Missing configs with alternatives and implementation suggestions
- ⚠️ Warnings about deprecated or conditional configs
- 📋 Implementation recommendations

**Example Usage:**
```
"Please verify if these BLE Kconfigs are available: BT_PERIPHERAL, BT_NUS, BT_AUDIO, BT_HRS"
```

## Usage Examples

After setup, you can ask Claude to analyze your Zephyr workspace:

```
"Can you analyze my Zephyr workspace at /home/user/zephyrproject?"

"What version of Zephyr is in /path/to/workspace?"

"List all the boards available in my West workspace"

"Show me the modules in my Nordic Connect SDK project"
```

### Custom .west Directory Location

If your `.west` directory is not located in the standard `workspace/.west` location, you can specify a custom path:

```
"Analyze my workspace at /home/user/project with the .west directory at /home/user/custom/.west"
```

The tools accept an optional `westPath` parameter for non-standard West configurations.

## Testing

You can test the MCP server directly:

```bash
# If installed globally
mcp-zephyr

# If installed locally  
npx mcp-zephyr
```

The server will start and wait for MCP protocol messages via stdin/stdout.

## Project Structure

```
mcp-zephyr/
├── src/
│   ├── index.js      # MCP server implementation
│   └── analyzer.js   # West workspace analyzer
├── package.json      # Node.js dependencies and metadata
├── LICENSE          # MIT license
└── README.md        # This documentation
```

## How It Works

1. **Workspace Validation**: Checks for `.west/config` to confirm a valid West workspace
2. **Configuration Parsing**: Reads West configuration to understand workspace structure
3. **Manifest Analysis**: Parses `west.yml` to identify projects and dependencies
4. **Component Discovery**: Scans for:
   - Zephyr version files
   - SDK versions (Nordic Connect SDK, etc.)
   - Hardware board definitions
   - Module directories
   - Build system files (Kconfig, CMake)
5. **Structured Output**: Returns organized information for AI consumption

## Supported Workspace Types

- Zephyr RTOS standalone workspaces
- Nordic Connect SDK (NCS) workspaces
- Custom West-managed projects
- Multi-repository Zephyr projects

## Troubleshooting

### Server doesn't start
- Ensure Node.js is installed: `node --version`
- Verify the package is installed: `npm list -g mcp-zephyr` (for global) or `npm list mcp-zephyr` (for local)
- Check your Claude Desktop configuration syntax (valid JSON)

### Workspace not recognized
- Confirm the workspace has a `.west` directory
- Check that the workspace was initialized with `west init`
- Ensure you're pointing to the workspace root, not a subdirectory

### Tools not appearing in Claude
- Restart Claude Desktop after configuration changes
- Check the configuration file syntax (valid JSON)
- Try using `claude mcp list` to see if the server is registered
- Look for errors in Claude's developer console

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests to improve the analyzer's capabilities or add support for additional Zephyr/West features.
