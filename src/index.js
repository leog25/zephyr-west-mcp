#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const WestWorkspaceAnalyzer = require('./analyzer.js');
const fs = require('fs');
const path = require('path');

class ZephyrMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: 'mcp-zephyr',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.configPath = path.join(__dirname, '..', '.mcp-config.json');
        this.defaultWorkspacePath = null;
        this.loadConfig();
        this.setupToolHandlers();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.defaultWorkspacePath = config.workspacePath;
            }
        } catch (error) {
            console.error('Error loading config:', error.message);
        }
    }

    saveConfig() {
        try {
            const config = { workspacePath: this.defaultWorkspacePath };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('Error saving config:', error.message);
        }
    }

    setupToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'analyze_workspace',
                    description: 'Analyze a West workspace directory for Zephyr/NCS components',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (containing .west folder)',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'get_zephyr_version',
                    description: 'Get Zephyr RTOS version from a workspace',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (optional if default workspace path is set)',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'list_modules',
                    description: 'List all modules in a West workspace',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (optional if default workspace path is set)',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'get_manifest_info',
                    description: 'Get West manifest information',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (optional if default workspace path is set)',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'list_boards',
                    description: 'List available boards in the workspace',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (optional if default workspace path is set)',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'get_build_info',
                    description: 'Get CMake and Kconfig build system information',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (optional if default workspace path is set)',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'verify_kconfigs',
                    description: 'Verify if specified Kconfig options are available in the workspace using LLM-powered analysis',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (optional if default workspace path is set)',
                            },
                            kconfigs: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                },
                                description: 'List of Kconfig options to verify (e.g., ["BT_PERIPHERAL", "BT_NUS", "BT_AUDIO"])',
                            },
                            westPath: {
                                type: 'string',
                                description: 'Optional: Custom path to the .west directory (defaults to path/.west)',
                            },
                        },
                        required: ['kconfigs'],
                    },
                },
                {
                    name: 'set_workspace_path',
                    description: 'Set the default West workspace path for all operations',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Path to the West workspace directory (containing .west folder)',
                            },
                        },
                        required: ['path'],
                    },
                },
                {
                    name: 'get_workspace_path',
                    description: 'Get the currently configured default West workspace path',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        additionalProperties: false,
                    },
                },
            ],
        }));

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'analyze_workspace':
                        return await this.analyzeWorkspace(args.path, args.westPath);

                    case 'get_zephyr_version':
                        return await this.getZephyrVersion(args.path, args.westPath);

                    case 'list_modules':
                        return await this.listModules(args.path, args.westPath);

                    case 'get_manifest_info':
                        return await this.getManifestInfo(args.path, args.westPath);

                    case 'list_boards':
                        return await this.listBoards(args.path, args.westPath);

                    case 'get_build_info':
                        return await this.getBuildInfo(args.path, args.westPath);

                    case 'verify_kconfigs':
                        return await this.verifyKconfigs(args.path, args.kconfigs, args.westPath);

                    case 'set_workspace_path':
                        return await this.setWorkspacePath(args.path);

                    case 'get_workspace_path':
                        return await this.getWorkspacePath();

                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error.message}`,
                        },
                    ],
                };
            }
        });
    }

    async analyzeWorkspace(workspacePath, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        const result = await analyzer.analyzeWorkspace();

        if (result.error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error analyzing workspace: ${result.error}`,
                    },
                ],
            };
        }

        const summary = this.createWorkspaceSummary(result);
        return {
            content: [
                {
                    type: 'text',
                    text: summary,
                },
            ],
        };
    }

    createWorkspaceSummary(analysis) {
        let summary = '# West Workspace Analysis\n\n';

        if (!analysis.isValid) {
            return summary + '⚠️ Not a valid West workspace\n';
        }

        // West Configuration
        summary += '## West Configuration\n';
        if (analysis.westConfig?.manifest) {
            summary += `- Manifest Path: ${analysis.westConfig.manifest.path}/${analysis.westConfig.manifest.file}\n`;
        }
        if (analysis.westConfig?.zephyr) {
            summary += `- Zephyr Base: ${analysis.westConfig.zephyr.base}\n`;
        }
        summary += '\n';

        // Zephyr Version
        if (analysis.zephyrVersion) {
            summary += '## Zephyr Version\n';
            summary += `- Version: ${analysis.zephyrVersion.full}\n`;
            summary += `- Major: ${analysis.zephyrVersion.major}, Minor: ${analysis.zephyrVersion.minor}, Patch: ${analysis.zephyrVersion.patch}\n`;
            summary += '\n';
        }

        // SDK Version
        if (analysis.sdkVersion) {
            summary += '## SDK Information\n';
            summary += `- ${analysis.sdkVersion.type}: v${analysis.sdkVersion.ncs}\n`;
            if (analysis.sdkVersion.additional) {
                summary += `- Additional: ${analysis.sdkVersion.additional}\n`;
            }
            summary += '\n';
        }

        // Projects
        if (analysis.projects && analysis.projects.length > 0) {
            summary += `## Projects (${analysis.projects.length})\n`;
            const mainProjects = analysis.projects.slice(0, 10);
            for (const project of mainProjects) {
                summary += `- ${project.name} (${project.revision || 'no-revision'})\n`;
            }
            if (analysis.projects.length > 10) {
                summary += `... and ${analysis.projects.length - 10} more\n`;
            }
            summary += '\n';
        }

        // Modules
        if (analysis.modules && analysis.modules.length > 0) {
            summary += `## Modules (${analysis.modules.length})\n`;
            const modulesByCategory = {};
            for (const module of analysis.modules) {
                const category = module.category || 'other';
                if (!modulesByCategory[category]) {
                    modulesByCategory[category] = [];
                }
                modulesByCategory[category].push(module.name);
            }
            for (const [category, modules] of Object.entries(modulesByCategory)) {
                summary += `- ${category}: ${modules.join(', ')}\n`;
            }
            summary += '\n';
        }

        // Boards
        if (analysis.boards && analysis.boards.length > 0) {
            summary += `## Boards (${analysis.boards.length})\n`;
            const boardsByArch = {};
            for (const board of analysis.boards) {
                const arch = board.arch || board.vendor || 'other';
                if (!boardsByArch[arch]) {
                    boardsByArch[arch] = [];
                }
                boardsByArch[arch].push(board.name);
            }
            for (const [arch, boards] of Object.entries(boardsByArch)) {
                summary += `- ${arch}: ${boards.slice(0, 5).join(', ')}`;
                if (boards.length > 5) {
                    summary += ` ... (${boards.length} total)`;
                }
                summary += '\n';
            }
            summary += '\n';
        }

        // Build System
        summary += '## Build System\n';
        if (analysis.kconfig?.files && analysis.kconfig.files.length > 0) {
            summary += `- Kconfig files: ${analysis.kconfig.files.length} found\n`;
        }
        if (analysis.cmake?.modules && analysis.cmake.modules.length > 0) {
            summary += `- CMake modules: ${analysis.cmake.modules.length} found\n`;
        }
        if (analysis.cmake?.toolchains && analysis.cmake.toolchains.length > 0) {
            summary += `- Toolchains: ${analysis.cmake.toolchains.length} configured\n`;
        }
        if (analysis.cmake?.packageConfig) {
            summary += `- Zephyr package config: Available\n`;
        }

        return summary;
    }

    async getZephyrVersion(workspacePath, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        await analyzer.getZephyrVersion();
        await analyzer.parseWestConfig();

        if (!analyzer.analysis.zephyrVersion) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Zephyr version not found in workspace',
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(analyzer.analysis.zephyrVersion, null, 2),
                },
            ],
        };
    }

    async listModules(workspacePath, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        await analyzer.parseWestConfig();
        await analyzer.parseManifest();
        await analyzer.discoverModules();

        const modules = analyzer.analysis.modules;
        if (!modules || modules.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No modules found in workspace',
                    },
                ],
            };
        }

        let text = `Found ${modules.length} modules:\n\n`;
        for (const module of modules) {
            text += `- ${module.name} (${module.category || 'manifest'})\n`;
            text += `  Path: ${module.path}\n`;
            if (module.hasCMake) text += '  ✓ CMake support\n';
            if (module.hasKconfig) text += '  ✓ Kconfig support\n';
            if (module.revision) text += `  Revision: ${module.revision}\n`;
            text += '\n';
        }

        return {
            content: [
                {
                    type: 'text',
                    text: text,
                },
            ],
        };
    }

    async getManifestInfo(workspacePath, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        await analyzer.parseWestConfig();
        await analyzer.parseManifest();

        if (!analyzer.analysis.manifest) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No manifest found in workspace',
                    },
                ],
            };
        }

        const manifest = analyzer.analysis.manifest;
        let text = '# West Manifest Information\n\n';

        if (manifest.manifest?.version) {
            text += `Version: ${manifest.manifest.version}\n\n`;
        }

        if (manifest.manifest?.remotes) {
            text += `## Remotes (${manifest.manifest.remotes.length})\n`;
            for (const remote of manifest.manifest.remotes) {
                text += `- ${remote.name}: ${remote['url-base']}\n`;
            }
            text += '\n';
        }

        if (manifest.manifest?.defaults) {
            text += '## Defaults\n';
            text += `- Remote: ${manifest.manifest.defaults.remote}\n`;
            if (manifest.manifest.defaults.revision) {
                text += `- Revision: ${manifest.manifest.defaults.revision}\n`;
            }
            text += '\n';
        }

        if (analyzer.analysis.projects?.length > 0) {
            text += `## Projects (${analyzer.analysis.projects.length})\n`;
            for (const project of analyzer.analysis.projects.slice(0, 20)) {
                text += `- ${project.name}\n`;
                text += `  Path: ${project.path}\n`;
                text += `  Revision: ${project.revision || 'default'}\n`;
                if (project.repoPath) {
                    text += `  Repo: ${project.repoPath}\n`;
                }
            }
            if (analyzer.analysis.projects.length > 20) {
                text += `\n... and ${analyzer.analysis.projects.length - 20} more projects\n`;
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: text,
                },
            ],
        };
    }

    async listBoards(workspacePath, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        await analyzer.parseWestConfig();
        await analyzer.findBoards();

        const boards = analyzer.analysis.boards;
        if (!boards || boards.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No boards found in workspace',
                    },
                ],
            };
        }

        let text = `Found ${boards.length} boards:\n\n`;
        
        // Group by architecture/vendor
        const grouped = {};
        for (const board of boards) {
            const key = board.arch || board.vendor || 'other';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(board);
        }

        for (const [group, groupBoards] of Object.entries(grouped)) {
            text += `## ${group} (${groupBoards.length})\n`;
            for (const board of groupBoards) {
                text += `- ${board.name}\n`;
                text += `  Path: ${board.path}\n`;
            }
            text += '\n';
        }

        return {
            content: [
                {
                    type: 'text',
                    text: text,
                },
            ],
        };
    }

    async getBuildInfo(workspacePath, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        await analyzer.parseWestConfig();
        await analyzer.findKconfigFiles();
        await analyzer.findCMakeConfigs();

        let text = '# Build System Information\n\n';

        // Kconfig
        text += '## Kconfig Files\n';
        if (analyzer.analysis.kconfig?.files?.length > 0) {
            for (const file of analyzer.analysis.kconfig.files) {
                text += `- ${file}\n`;
            }
        } else {
            text += 'No Kconfig files found\n';
        }
        text += '\n';

        // CMake Modules
        text += '## CMake Modules\n';
        if (analyzer.analysis.cmake?.modules?.length > 0) {
            for (const module of analyzer.analysis.cmake.modules.slice(0, 20)) {
                text += `- ${module}\n`;
            }
            if (analyzer.analysis.cmake.modules.length > 20) {
                text += `... and ${analyzer.analysis.cmake.modules.length - 20} more\n`;
            }
        } else {
            text += 'No CMake modules found\n';
        }
        text += '\n';

        // Toolchains
        text += '## Toolchain Configurations\n';
        if (analyzer.analysis.cmake?.toolchains?.length > 0) {
            for (const toolchain of analyzer.analysis.cmake.toolchains) {
                text += `- ${toolchain}\n`;
            }
        } else {
            text += 'No toolchain configurations found\n';
        }
        text += '\n';

        // Package Config
        if (analyzer.analysis.cmake?.packageConfig) {
            text += '## Zephyr Package\n';
            text += `- Config: ${analyzer.analysis.cmake.packageConfig}\n`;
        }

        return {
            content: [
                {
                    type: 'text',
                    text: text,
                },
            ],
        };
    }

    getEffectiveWorkspacePath(providedPath) {
        return providedPath || this.defaultWorkspacePath;
    }

    async setWorkspacePath(workspacePath) {
        // Validate the path exists and is a West workspace
        if (!fs.existsSync(workspacePath)) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Path does not exist: ${workspacePath}`,
                    },
                ],
            };
        }

        const westConfigPath = path.join(workspacePath, '.west', 'config');
        if (!fs.existsSync(westConfigPath)) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Not a valid West workspace. Missing .west/config at: ${workspacePath}`,
                    },
                ],
            };
        }

        this.defaultWorkspacePath = workspacePath;
        this.saveConfig();

        return {
            content: [
                {
                    type: 'text',
                    text: `✅ Default West workspace path set to: ${workspacePath}`,
                },
            ],
        };
    }

    async getWorkspacePath() {
        return {
            content: [
                {
                    type: 'text',
                    text: this.defaultWorkspacePath 
                        ? `Current default workspace path: ${this.defaultWorkspacePath}`
                        : 'No default workspace path configured. Use set_workspace_path to configure one.',
                },
            ],
        };
    }

    async verifyKconfigs(workspacePath, kconfigs, westPath) {
        const effectivePath = this.getEffectiveWorkspacePath(workspacePath);
        
        if (!effectivePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Error: No workspace path provided and no default path configured. Use set_workspace_path first or provide path parameter.',
                    },
                ],
            };
        }

        const analyzer = new WestWorkspaceAnalyzer(effectivePath, { westPath });
        await analyzer.parseWestConfig();

        const results = await analyzer.verifyKconfigs(kconfigs);

        // Build comprehensive report with LLM analysis
        let text = '# Kconfig Verification Report (LLM-Powered Analysis)\n\n';
        
        const available = results.filter(r => r.available);
        const missing = results.filter(r => !r.available);
        const warnings = results.filter(r => r.warning);

        // Summary
        text += `## Summary\n`;
        text += `- ✅ Available: ${available.length}\n`;
        text += `- ❌ Missing: ${missing.length}\n`;
        if (warnings.length > 0) {
            text += `- ⚠️  Warnings: ${warnings.length}\n`;
        }
        text += '\n';

        // Available configs
        if (available.length > 0) {
            text += '## ✅ Available Kconfigs\n';
            for (const config of available) {
                text += `### CONFIG_${config.name}\n`;
                text += `- **Status**: Available (LLM-verified)\n`;
                text += `- **Source**: ${config.source}\n`;
                if (config.description) {
                    text += `- **Description**: ${config.description}\n`;
                }
                if (config.dependencies && config.dependencies.length > 0) {
                    text += `- **Dependencies**: ${config.dependencies.join(', ')}\n`;
                }
                if (config.warning) {
                    text += `- **Warning**: ${config.warning}\n`;
                }
                text += '\n';
            }
        }

        // Missing configs
        if (missing.length > 0) {
            text += '## ❌ Missing Kconfigs\n';
            for (const config of missing) {
                text += `### CONFIG_${config.name}\n`;
                text += `- **Status**: Not found in workspace\n`;
                if (config.suggestions && config.suggestions.length > 0) {
                    text += `- **Suggestions**: ${config.suggestions.join(', ')}\n`;
                }
                if (config.alternatives && config.alternatives.length > 0) {
                    text += `- **Alternatives**: ${config.alternatives.join(', ')}\n`;
                }
                text += '\n';
            }
        }

        // Implementation recommendations
        text += '## 📋 Implementation Recommendations\n\n';
        if (missing.length === 0) {
            text += '✅ All requested Kconfigs are available. You can proceed with implementation.\n\n';
            
            if (available.some(c => c.dependencies?.length > 0)) {
                text += '**Required Dependencies:**\n';
                const allDeps = new Set();
                available.forEach(c => {
                    if (c.dependencies) {
                        c.dependencies.forEach(dep => allDeps.add(dep));
                    }
                });
                for (const dep of allDeps) {
                    text += `- CONFIG_${dep}=y\n`;
                }
                text += '\n';
            }
        } else {
            text += `⚠️  ${missing.length} Kconfig(s) are missing from your workspace.\n\n`;
            
            text += '**Options:**\n';
            text += '1. Remove missing Kconfigs from your configuration\n';
            text += '2. Implement missing functionality manually\n';
            text += '3. Use alternative Kconfigs where suggested\n';
            text += '4. Check if missing Kconfigs are available in samples or applications\n\n';
        }

        // Warnings section
        if (warnings.length > 0) {
            text += '## ⚠️  Warnings\n';
            for (const config of warnings) {
                text += `- **CONFIG_${config.name}**: ${config.warning}\n`;
            }
            text += '\n';
        }

        return {
            content: [
                {
                    type: 'text',
                    text: text,
                },
            ],
        };
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
}

// Start the server
const server = new ZephyrMCPServer();
server.start().catch(console.error);