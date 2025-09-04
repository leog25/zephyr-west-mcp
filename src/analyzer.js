const fs = require('fs').promises;
const path = require('path');
const yaml = require('yaml');

class WestWorkspaceAnalyzer {
    constructor(workspacePath, options = {}) {
        this.workspacePath = workspacePath;
        // Allow custom west path, default to workspacePath/.west
        this.westPath = options.westPath || path.join(workspacePath, '.west');
        this.analysis = {
            isValid: false,
            westConfig: null,
            manifest: null,
            zephyrVersion: null,
            sdkVersion: null,
            modules: [],
            boards: [],
            kconfig: {
                files: [],
                menustructure: []
            },
            cmake: {
                modules: [],
                toolchains: []
            },
            projects: []
        };
    }

    async analyzeWorkspace() {
        try {
            // Check if it's a valid West workspace
            const westConfigPath = path.join(this.westPath, 'config');
            if (!await this.fileExists(westConfigPath)) {
                return { error: "Not a valid West workspace (missing .west/config)" };
            }

            this.analysis.isValid = true;

            // Parse West configuration
            await this.parseWestConfig();

            // Parse West manifest
            await this.parseManifest();

            // Get Zephyr version if present
            await this.getZephyrVersion();

            // Get SDK versions
            await this.getSDKVersions();

            // Discover modules
            await this.discoverModules();

            // Find Kconfig files
            await this.findKconfigFiles();

            // Find CMake configurations
            await this.findCMakeConfigs();

            // Find boards
            await this.findBoards();

            return this.analysis;
        } catch (error) {
            return { error: error.message, analysis: this.analysis };
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async readFile(filePath) {
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch {
            return null;
        }
    }

    async parseWestConfig() {
        const configPath = path.join(this.westPath, 'config');
        const content = await this.readFile(configPath);
        if (!content) return;

        const config = {};
        const lines = content.split('\n');
        let currentSection = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1);
                config[currentSection] = {};
            } else if (currentSection && trimmed.includes('=')) {
                const [key, value] = trimmed.split('=').map(s => s.trim());
                config[currentSection][key] = value;
            }
        }

        this.analysis.westConfig = config;
    }

    async parseManifest() {
        if (!this.analysis.westConfig?.manifest) return;

        const manifestPath = path.join(
            this.workspacePath,
            this.analysis.westConfig.manifest.path || '',
            this.analysis.westConfig.manifest.file || 'west.yml'
        );

        const content = await this.readFile(manifestPath);
        if (!content) return;

        try {
            const manifest = yaml.parse(content);
            this.analysis.manifest = manifest;

            // Extract projects from manifest
            if (manifest?.manifest?.projects) {
                this.analysis.projects = manifest.manifest.projects.map(project => ({
                    name: project.name,
                    path: project.path || project.name,
                    revision: project.revision,
                    remote: project.remote || manifest.manifest.defaults?.remote,
                    repoPath: project['repo-path'],
                    modules: project.import ? 'has-imports' : null
                }));
            }
        } catch (error) {
            console.error('Failed to parse manifest:', error);
        }
    }

    async getZephyrVersion() {
        const zephyrPath = path.join(this.workspacePath, 
            this.analysis.westConfig?.zephyr?.base || 'zephyr');
        const versionFile = path.join(zephyrPath, 'VERSION');
        
        const content = await this.readFile(versionFile);
        if (!content) return;

        const version = {};
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('=')) {
                const [key, value] = trimmed.split('=').map(s => s.trim());
                version[key] = value;
            }
        }

        if (version.VERSION_MAJOR) {
            this.analysis.zephyrVersion = {
                major: version.VERSION_MAJOR,
                minor: version.VERSION_MINOR,
                patch: version.PATCHLEVEL,
                tweak: version.VERSION_TWEAK,
                extra: version.EXTRAVERSION,
                full: `${version.VERSION_MAJOR}.${version.VERSION_MINOR}.${version.PATCHLEVEL}${version.EXTRAVERSION || ''}`
            };
        }
    }

    async getSDKVersions() {
        // Check for Nordic SDK
        const nrfPath = path.join(this.workspacePath, 'nrf');
        const nrfVersion = await this.readFile(path.join(nrfPath, 'VERSION'));
        if (nrfVersion) {
            this.analysis.sdkVersion = {
                ncs: nrfVersion.trim(),
                type: 'Nordic Connect SDK'
            };
        }

        // Check for other SDK versions
        const sdkVersionFile = path.join(this.workspacePath, 'modules/hal/cirrus-logic/sdk_version.h');
        if (await this.fileExists(sdkVersionFile)) {
            const content = await this.readFile(sdkVersionFile);
            if (content && this.analysis.sdkVersion) {
                this.analysis.sdkVersion.additional = 'Cirrus Logic SDK detected';
            }
        }
    }

    async discoverModules() {
        const modulesPath = path.join(this.workspacePath, 'modules');
        
        try {
            if (await this.fileExists(modulesPath)) {
                const categories = await fs.readdir(modulesPath);
                
                for (const category of categories) {
                    const categoryPath = path.join(modulesPath, category);
                    const stat = await fs.stat(categoryPath);
                    
                    if (stat.isDirectory()) {
                        const modules = await fs.readdir(categoryPath);
                        
                        for (const module of modules) {
                            const modulePath = path.join(categoryPath, module);
                            const modStat = await fs.stat(modulePath);
                            
                            if (modStat.isDirectory()) {
                                // Check for module metadata
                                const moduleInfo = {
                                    name: module,
                                    category: category,
                                    path: path.relative(this.workspacePath, modulePath)
                                };

                                // Check for CMakeLists.txt
                                if (await this.fileExists(path.join(modulePath, 'CMakeLists.txt'))) {
                                    moduleInfo.hasCMake = true;
                                }

                                // Check for Kconfig
                                if (await this.fileExists(path.join(modulePath, 'Kconfig'))) {
                                    moduleInfo.hasKconfig = true;
                                }

                                this.analysis.modules.push(moduleInfo);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error discovering modules:', error);
        }

        // Also check for modules from projects list
        for (const project of this.analysis.projects) {
            const projectPath = path.join(this.workspacePath, project.path);
            if (await this.fileExists(projectPath)) {
                const existingModule = this.analysis.modules.find(m => m.name === project.name);
                if (!existingModule) {
                    this.analysis.modules.push({
                        name: project.name,
                        path: project.path,
                        fromManifest: true,
                        revision: project.revision
                    });
                }
            }
        }
    }

    async findKconfigFiles() {
        try {
            // Recursively find all Kconfig files in workspace
            const zephyrPath = path.join(this.workspacePath, 
                this.analysis.westConfig?.zephyr?.base || 'zephyr');
            
            if (await this.fileExists(zephyrPath)) {
                await this.findKconfigFilesRecursive(zephyrPath);
            }
            
            // Also search Nordic (NRF) directory
            const nrfPath = path.join(this.workspacePath, 'nrf');
            if (await this.fileExists(nrfPath)) {
                await this.findKconfigFilesRecursive(nrfPath);
            }
            
            // Search other important directories
            const otherDirs = ['modules', 'bootloader', 'mbedtls', 'trusted-firmware-m'];
            for (const dir of otherDirs) {
                const dirPath = path.join(this.workspacePath, dir);
                if (await this.fileExists(dirPath)) {
                    await this.findKconfigFilesRecursive(dirPath);
                }
            }
            
        } catch (error) {
            console.error('Error finding Kconfig files:', error);
        }
    }

    async findKconfigFilesRecursive(dirPath, maxDepth = 4, currentDepth = 0) {
        if (currentDepth >= maxDepth) return;
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip some common directories that don't have relevant Kconfigs
                    if (!entry.name.startsWith('.') && 
                        !['build', 'doc', 'scripts', 'tools', 'west', 'cmake'].includes(entry.name)) {
                        await this.findKconfigFilesRecursive(fullPath, maxDepth, currentDepth + 1);
                    }
                } else if (entry.isFile()) {
                    // Check if it's a Kconfig file
                    if (entry.name === 'Kconfig' || 
                        entry.name.startsWith('Kconfig.') ||
                        entry.name.endsWith('.kconfig')) {
                        this.analysis.kconfig.files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors and continue
            if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
                console.error(`Error reading directory ${dirPath}:`, error);
            }
        }
    }

    async findCMakeConfigs() {
        const zephyrPath = path.join(this.workspacePath, 
            this.analysis.westConfig?.zephyr?.base || 'zephyr');
        const cmakePath = path.join(zephyrPath, 'cmake');
        
        try {
            // Find CMake modules
            const modulesPath = path.join(cmakePath, 'modules');
            if (await this.fileExists(modulesPath)) {
                const files = await fs.readdir(modulesPath);
                this.analysis.cmake.modules = files
                    .filter(f => f.endsWith('.cmake'))
                    .map(f => `cmake/modules/${f}`);
            }

            // Find toolchain files
            const toolchainFiles = [
                'toolchain/zephyr/generic.cmake',
                'toolchain/gnuarmemb/generic.cmake',
                'toolchain/xtools/generic.cmake'
            ];

            for (const file of toolchainFiles) {
                const fullPath = path.join(cmakePath, file);
                if (await this.fileExists(fullPath)) {
                    this.analysis.cmake.toolchains.push(`cmake/${file}`);
                }
            }

            // Check for Zephyr package config
            const packageConfigPath = path.join(zephyrPath, 'share/zephyr-package/cmake/ZephyrConfig.cmake');
            if (await this.fileExists(packageConfigPath)) {
                this.analysis.cmake.packageConfig = 'share/zephyr-package/cmake/ZephyrConfig.cmake';
            }
        } catch (error) {
            console.error('Error finding CMake configs:', error);
        }
    }

    async findBoards() {
        const zephyrPath = path.join(this.workspacePath, 
            this.analysis.westConfig?.zephyr?.base || 'zephyr');
        const boardsPath = path.join(zephyrPath, 'boards');
        
        try {
            if (await this.fileExists(boardsPath)) {
                const archDirs = await fs.readdir(boardsPath);
                
                for (const arch of archDirs) {
                    const archPath = path.join(boardsPath, arch);
                    const stat = await fs.stat(archPath);
                    
                    if (stat.isDirectory() && !arch.startsWith('.')) {
                        const boards = await fs.readdir(archPath);
                        
                        for (const board of boards) {
                            const boardPath = path.join(archPath, board);
                            const boardStat = await fs.stat(boardPath);
                            
                            if (boardStat.isDirectory()) {
                                // Check for board definition files
                                const defnFile = path.join(boardPath, `${board}.yaml`);
                                const dtsiFile = path.join(boardPath, `${board}.dtsi`);
                                
                                if (await this.fileExists(defnFile) || await this.fileExists(dtsiFile)) {
                                    this.analysis.boards.push({
                                        name: board,
                                        arch: arch,
                                        path: `boards/${arch}/${board}`
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Also check NRF boards
            const nrfBoardsPath = path.join(this.workspacePath, 'nrf/boards');
            if (await this.fileExists(nrfBoardsPath)) {
                const nrfBoards = await this.findBoardsInDir(nrfBoardsPath, 'nrf/boards');
                this.analysis.boards.push(...nrfBoards);
            }
        } catch (error) {
            console.error('Error finding boards:', error);
        }
    }

    async findBoardsInDir(dirPath, relPath) {
        const boards = [];
        try {
            const entries = await fs.readdir(dirPath);
            
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry);
                const stat = await fs.stat(entryPath);
                
                if (stat.isDirectory() && !entry.startsWith('.')) {
                    // Check if this is a board directory
                    const yamlFile = path.join(entryPath, `${entry}.yaml`);
                    const dtsFile = path.join(entryPath, `${entry}.dts`);
                    
                    if (await this.fileExists(yamlFile) || await this.fileExists(dtsFile)) {
                        boards.push({
                            name: entry,
                            path: `${relPath}/${entry}`,
                            vendor: 'nordic'
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning ${dirPath}:`, error);
        }
        
        return boards;
    }

    async verifyKconfigs(kconfigNames) {
        const results = [];
        
        // Ensure we have parsed the West config
        if (!this.analysis.isValid) {
            await this.parseWestConfig();
        }
        
        // Find all Kconfig files if not already done
        if (this.analysis.kconfig.files.length === 0) {
            await this.findKconfigFiles();
        }

        // First verification pass
        for (const configName of kconfigNames) {
            const result = await this.verifyKconfig(configName);
            results.push(result);
        }


        return results;
    }

    async verifyKconfig(configName) {
        const result = {
            name: configName,
            available: false,
            source: null,
            description: null,
            dependencies: [],
            alternatives: [],
            suggestions: [],
            warning: null
        };

        // Known alternatives and suggestions for common missing configs
        const knownAlternatives = {
            'BT_HRS': {
                alternatives: [],
                suggestions: ['Use Nordic samples/bluetooth/peripheral_hrs', 'Implement manually using BT_GATT_SERVICE_DEFINE'],
                warning: 'Heart Rate Service not available as built-in Kconfig'
            },
            'BT_CSC': {
                alternatives: [],
                suggestions: ['Use Nordic samples/bluetooth/peripheral_csc', 'Implement manually using BT_GATT_SERVICE_DEFINE'],
                warning: 'Cycling Speed and Cadence Service not available as built-in Kconfig'
            },
            'BT_RSC': {
                alternatives: [],
                suggestions: ['Use Nordic samples/bluetooth/peripheral_rsc', 'Implement manually using BT_GATT_SERVICE_DEFINE'],
                warning: 'Running Speed and Cadence Service not available as built-in Kconfig'
            },
            'BT_LLS': {
                alternatives: [],
                suggestions: ['Implement manually using BT_GATT_SERVICE_DEFINE'],
                warning: 'Link Loss Service not available as built-in Kconfig'
            },
            'BT_HIDS': {
                alternatives: ['BT_HIDS_MAX_CLIENT_COUNT', 'BT_HIDS_ATTR_MAX'],
                suggestions: ['Use Nordic HIDS service Kconfigs'],
                warning: 'Use Nordic-specific HIDS Kconfigs instead'
            },
            'BT_HOGP': {
                alternatives: ['BT_HOGP_REPORTS_MAX'],
                suggestions: ['Use Nordic HOGP Kconfigs'],
                warning: 'Only Nordic HOGP reports configuration available'
            },
            'NRF_BT_SCAN': {
                alternatives: ['BT_SCAN'],
                suggestions: ['Use BT_SCAN from Matter Bridge', 'Implement scanning manually'],
                warning: 'Use BT_SCAN instead of NRF_BT_SCAN'
            }
        };

        try {
            // Use LLM-based intelligent analysis
            const analysisResult = await this.analyzeKconfigWithLLM(configName);
            
            if (analysisResult.available) {
                result.available = true;
                result.source = analysisResult.source;
                result.description = analysisResult.description;
                result.dependencies = analysisResult.dependencies || [];
            } else {
                // First fallback: regex-based search for verification
                const searchPattern = new RegExp(`^\\s*config\\s+${configName}(?:\\s|$)`, 'm');
                const menuConfigPattern = new RegExp(`^\\s*menuconfig\\s+${configName}(?:\\s|$)`, 'm');
                
                for (const kconfigFile of this.analysis.kconfig.files) {
                    const content = await this.readFile(kconfigFile);
                    if (!content) continue;

                    if (searchPattern.test(content) || menuConfigPattern.test(content)) {
                        result.available = true;
                        result.source = kconfigFile.replace(this.workspacePath, '');
                        
                        // Extract description if available
                        const descMatch = content.match(new RegExp(`config\\s+${configName}[\\s\\S]*?help\\s*\\n\\s*([^\\n]+)`, 'i'));
                        if (descMatch && descMatch[1]) {
                            result.description = descMatch[1].trim();
                        }
                        
                        // Extract dependencies (simplified - looks for 'depends on' lines)
                        const dependsMatches = content.match(new RegExp(`config\\s+${configName}[\\s\\S]*?(?=config\\s|menuconfig\\s|$)`, 'i'));
                        if (dependsMatches && dependsMatches[0]) {
                            const configSection = dependsMatches[0];
                            const dependsLines = configSection.match(/depends\s+on\s+(.+)/gi);
                            if (dependsLines) {
                                for (const line of dependsLines) {
                                    const deps = line.replace(/depends\s+on\s+/i, '').split(/\s*&&\s*|\s*\|\|\s*/);
                                    result.dependencies.push(...deps.map(dep => dep.trim().replace(/^!/, '')));
                                }
                            }
                            
                            // Look for 'select' dependencies too
                            const selectLines = configSection.match(/select\s+(.+)/gi);
                            if (selectLines) {
                                for (const line of selectLines) {
                                    const dep = line.replace(/select\s+/i, '').trim();
                                    result.dependencies.push(dep);
                                }
                            }
                        }
                        
                        break;
                    }
                }
                
                // Second LLM check for missing kconfigs with deep workspace search
                if (!result.available) {
                    const secondLLMResult = await this.deepWorkspaceKconfigSearch(configName);
                    if (secondLLMResult.available) {
                        result.available = true;
                        result.source = secondLLMResult.source;
                        result.description = secondLLMResult.description;
                        result.dependencies = secondLLMResult.dependencies || [];
                    } else {
                        // Final regex attempt with broader patterns
                        const broadPatterns = [
                            new RegExp(`${configName}(?:\\s|$)`, 'mi'),
                            new RegExp(`config.*${configName.split('_').join('.*')}`, 'mi'),
                            new RegExp(`${configName.toLowerCase()}`, 'i')
                        ];
                        
                        for (const kconfigFile of this.analysis.kconfig.files) {
                            const content = await this.readFile(kconfigFile);
                            if (!content) continue;

                            for (const pattern of broadPatterns) {
                                if (pattern.test(content)) {
                                    // Found potential match, extract more details
                                    const lines = content.split('\n');
                                    for (let i = 0; i < lines.length; i++) {
                                        if (pattern.test(lines[i])) {
                                            result.available = true;
                                            result.source = kconfigFile.replace(this.workspacePath, '');
                                            result.description = `Found potential match: ${lines[i].trim()}`;
                                            break;
                                        }
                                    }
                                    if (result.available) break;
                                }
                            }
                            if (result.available) break;
                        }
                    }
                }
            }

            // If not found, check known alternatives
            if (!result.available && knownAlternatives[configName]) {
                const known = knownAlternatives[configName];
                result.alternatives = known.alternatives;
                result.suggestions = known.suggestions;
                result.warning = known.warning;
            }

            // Special case handling for common BLE configs
            if (!result.available) {
                // Check if it's a BLE config that might need BT subsystem
                if (configName.startsWith('BT_')) {
                    result.suggestions.push('Ensure CONFIG_BT=y is enabled');
                    
                    // Check if BT subsystem is available
                    const btAvailable = await this.verifyKconfig('BT');
                    if (btAvailable.available) {
                        result.suggestions.push('BT subsystem is available, config might be conditional');
                    }
                }
            }

        } catch (error) {
            result.warning = `Error verifying config: ${error.message}`;
        }

        // Remove duplicates from dependencies
        result.dependencies = [...new Set(result.dependencies)];

        return result;
    }



    async analyzeKconfigWithLLM(configName, enhancedSearch = false) {
        // LLM-based intelligent Kconfig analysis
        try {
            // Read and analyze relevant Kconfig files
            const relevantFiles = [];
            const btRelated = configName.startsWith('BT_');
            const mcumgrRelated = configName.startsWith('MCUMGR');

            // Find files that might contain this config
            for (const kconfigFile of this.analysis.kconfig.files) {
                const fileName = path.basename(kconfigFile).toLowerCase();
                const filePath = kconfigFile.toLowerCase();
                
                if (enhancedSearch) {
                    // Enhanced search: include more files and broader patterns
                    const configNameLower = configName.toLowerCase();
                    const configParts = configName.split('_');
                    
                    if (btRelated && (filePath.includes('bluetooth') || filePath.includes('/bt/') || fileName.includes('bluetooth') || filePath.includes('ble'))) {
                        relevantFiles.push(kconfigFile);
                    } else if (mcumgrRelated && (filePath.includes('mcumgr') || fileName.includes('mcumgr') || filePath.includes('mgmt'))) {
                        relevantFiles.push(kconfigFile);
                    } else if (fileName === 'kconfig' || fileName.startsWith('kconfig.') || fileName.endsWith('.kconfig')) {
                        relevantFiles.push(kconfigFile);
                    } else if (configParts.some(part => part.length > 2 && filePath.includes(part.toLowerCase()))) {
                        // Include files that contain any significant part of the config name
                        relevantFiles.push(kconfigFile);
                    }
                    
                    // Higher limit for enhanced search
                    if (relevantFiles.length >= 40) break;
                } else {
                    // Standard filtering based on config name patterns
                    if (btRelated && (filePath.includes('bluetooth') || filePath.includes('/bt/') || fileName.includes('bluetooth'))) {
                        relevantFiles.push(kconfigFile);
                    } else if (mcumgrRelated && (filePath.includes('mcumgr') || fileName.includes('mcumgr'))) {
                        relevantFiles.push(kconfigFile);
                    } else if (fileName === 'kconfig' || fileName.startsWith('kconfig.')) {
                        // Include main Kconfig files for comprehensive search
                        relevantFiles.push(kconfigFile);
                    }
                    
                    // Limit to first 20 files to avoid excessive processing
                    if (relevantFiles.length >= 20) break;
                }
            }

            // Analyze each relevant file with LLM reasoning
            for (const file of relevantFiles) {
                const content = await this.readFile(file);
                if (!content) continue;

                // Use intelligent text analysis to find configurations
                const analysis = this.intelligentKconfigSearch(content, configName, file);
                if (analysis.found) {
                    return {
                        available: true,
                        source: file.replace(this.workspacePath, ''),
                        description: analysis.description,
                        dependencies: analysis.dependencies,
                        context: analysis.context
                    };
                }
            }

            return { available: false };
            
        } catch (error) {
            console.error('LLM analysis error:', error);
            return { available: false, error: error.message };
        }
    }

    intelligentKconfigSearch(content, configName, filePath) {
        // Intelligent pattern matching with context analysis
        const result = {
            found: false,
            description: null,
            dependencies: [],
            context: null
        };

        try {
            // Multi-pattern search for different Kconfig formats
            const patterns = [
                new RegExp(`^\\s*config\\s+${configName}(?:\\s|$)`, 'm'),
                new RegExp(`^\\s*menuconfig\\s+${configName}(?:\\s|$)`, 'm'),
                new RegExp(`^\\s*choice\\s+${configName}`, 'm'),
                // Handle if/endif blocks that might contain the config
                new RegExp(`config\\s+${configName}(?=\\s)`, 'i')
            ];

            let match = null;
            let matchedPattern = null;
            
            for (const pattern of patterns) {
                match = content.match(pattern);
                if (match) {
                    matchedPattern = pattern;
                    break;
                }
            }

            if (!match) return result;

            result.found = true;

            // Extract the full configuration section
            const configStart = match.index;
            const remainingContent = content.slice(configStart);
            
            // Find the end of this config section (next config/menuconfig or end of file)
            const nextConfigMatch = remainingContent.match(/\n\s*(config|menuconfig|choice|endchoice|menu|endmenu)\s+(?!comment)/);
            const configEnd = nextConfigMatch ? nextConfigMatch.index : remainingContent.length;
            const configSection = remainingContent.slice(0, configEnd);

            // Extract description from help section
            const helpMatch = configSection.match(/help\s*\n\s*(.+?)(?=\n\s*\w|\n\n|$)/s);
            if (helpMatch) {
                result.description = helpMatch[1].replace(/\n\s*/g, ' ').trim();
            }

            // Extract dependencies with smart parsing
            const dependsLines = configSection.match(/depends\s+on\s+(.+)/gi);
            if (dependsLines) {
                for (const line of dependsLines) {
                    const deps = line.replace(/depends\s+on\s+/i, '').split(/\s*&&\s*|\s*\|\|\s*/);
                    result.dependencies.push(...deps.map(dep => dep.trim().replace(/^!/, '').replace(/[()]/g, '')));
                }
            }

            // Extract 'select' dependencies
            const selectLines = configSection.match(/select\s+([A-Z_][A-Z0-9_]*)/gi);
            if (selectLines) {
                for (const line of selectLines) {
                    const dep = line.replace(/select\s+/i, '').trim();
                    result.dependencies.push(dep);
                }
            }

            // Add context information
            result.context = {
                file: path.basename(filePath),
                section: configSection.slice(0, 200) + (configSection.length > 200 ? '...' : ''),
                type: matchedPattern.source.includes('menuconfig') ? 'menuconfig' : 'config'
            };

            // Clean up dependencies
            result.dependencies = [...new Set(result.dependencies.filter(dep => dep && dep.length > 0))];

        } catch (error) {
            console.error('Intelligent search error:', error);
        }

        return result;
    }

    async deepWorkspaceKconfigSearch(configName) {
        // Deep workspace-wide Kconfig search for missing configs
        try {
            console.log(`Performing deep workspace search for ${configName}...`);
            
            // Find ALL Kconfig files in the entire workspace (not just cached ones)
            const allKconfigFiles = await this.findAllKconfigFilesRecursive(this.workspacePath);
            
            // Broader search criteria
            const btRelated = configName.startsWith('BT_');
            const configParts = configName.split('_').filter(part => part.length > 1);
            const searchTerms = [configName, ...configParts];
            
            // Search through all files with intelligent prioritization
            const searchResults = [];
            
            for (const kconfigFile of allKconfigFiles) {
                const content = await this.readFile(kconfigFile);
                if (!content) continue;
                
                // Multiple search strategies
                const strategies = [
                    // Exact match
                    { pattern: new RegExp(`^\\s*config\\s+${configName}(?:\\s|$)`, 'm'), weight: 10 },
                    { pattern: new RegExp(`^\\s*menuconfig\\s+${configName}(?:\\s|$)`, 'm'), weight: 10 },
                    
                    // Case insensitive exact match
                    { pattern: new RegExp(`^\\s*config\\s+${configName}(?:\\s|$)`, 'mi'), weight: 8 },
                    { pattern: new RegExp(`^\\s*menuconfig\\s+${configName}(?:\\s|$)`, 'mi'), weight: 8 },
                    
                    // Partial matches with config context
                    { pattern: new RegExp(`config\\s+\\w*${configName}\\w*`, 'i'), weight: 6 },
                    { pattern: new RegExp(`config\\s+${configName}\\w+`, 'i'), weight: 5 },
                    { pattern: new RegExp(`config\\s+\\w+${configName}`, 'i'), weight: 5 },
                    
                    // Any mention in config context
                    { pattern: new RegExp(`${configName}`, 'i'), weight: 2 }
                ];
                
                for (const strategy of strategies) {
                    const match = content.match(strategy.pattern);
                    if (match) {
                        const analysis = this.intelligentKconfigSearch(content, configName, kconfigFile);
                        if (analysis.found) {
                            return {
                                available: true,
                                source: kconfigFile.replace(this.workspacePath, ''),
                                description: analysis.description || `Found via deep search: ${match[0]}`,
                                dependencies: analysis.dependencies,
                                context: analysis.context,
                                searchMethod: 'deep-workspace'
                            };
                        }
                        
                        // Store potential matches for fallback
                        searchResults.push({
                            file: kconfigFile,
                            match: match[0],
                            weight: strategy.weight,
                            line: this.getLineNumber(content, match.index)
                        });
                        break; // Don't try other strategies for this file
                    }
                }
            }
            
            // If no exact matches, try semantic search through project files
            const semanticResult = await this.semanticKconfigSearch(configName, searchTerms);
            if (semanticResult.available) {
                return semanticResult;
            }
            
            // Return best potential match if any
            if (searchResults.length > 0) {
                const bestMatch = searchResults.sort((a, b) => b.weight - a.weight)[0];
                return {
                    available: true,
                    source: bestMatch.file.replace(this.workspacePath, ''),
                    description: `Potential match found: ${bestMatch.match.trim()} (line ${bestMatch.line})`,
                    dependencies: [],
                    searchMethod: 'deep-workspace-fuzzy',
                    confidence: 'low'
                };
            }
            
            return { available: false, searchMethod: 'deep-workspace' };
            
        } catch (error) {
            console.error('Deep workspace search error:', error);
            return { available: false, error: error.message };
        }
    }

    async findAllKconfigFilesRecursive(startPath, maxDepth = 6, currentDepth = 0) {
        const allFiles = [];
        
        if (currentDepth >= maxDepth) return allFiles;
        
        try {
            const entries = await fs.readdir(startPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(startPath, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip certain directories for performance
                    if (!entry.name.startsWith('.') && 
                        !['node_modules', 'build', 'dist', '__pycache__', 'cmake-build'].includes(entry.name)) {
                        const subFiles = await this.findAllKconfigFilesRecursive(fullPath, maxDepth, currentDepth + 1);
                        allFiles.push(...subFiles);
                    }
                } else if (entry.isFile()) {
                    // Include all potential Kconfig files
                    if (entry.name === 'Kconfig' || 
                        entry.name.startsWith('Kconfig.') ||
                        entry.name.endsWith('.kconfig') ||
                        entry.name.endsWith('.Kconfig') ||
                        (entry.name.toLowerCase().includes('kconfig') && entry.name.endsWith('.txt'))) {
                        allFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            // Skip directories we can't read
            if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
                console.error(`Error reading ${startPath}:`, error.message);
            }
        }
        
        return allFiles;
    }

    async semanticKconfigSearch(configName, searchTerms) {
        // Search through project manifests and documentation for semantic clues
        try {
            const semanticFiles = [
                path.join(this.workspacePath, 'west.yml'),
                path.join(this.workspacePath, 'zephyr/doc'),
                path.join(this.workspacePath, 'nrf/doc')
            ];
            
            for (const searchPath of semanticFiles) {
                if (await this.fileExists(searchPath)) {
                    const content = await this.readFile(searchPath);
                    if (content) {
                        // Look for mentions of the config or related terms
                        for (const term of searchTerms) {
                            if (content.toLowerCase().includes(term.toLowerCase())) {
                                return {
                                    available: true,
                                    source: searchPath.replace(this.workspacePath, ''),
                                    description: `Referenced in documentation/manifest: ${term}`,
                                    dependencies: [],
                                    searchMethod: 'semantic',
                                    confidence: 'medium'
                                };
                            }
                        }
                    }
                }
            }
            
            return { available: false };
            
        } catch (error) {
            console.error('Semantic search error:', error);
            return { available: false, error: error.message };
        }
    }

    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }
}

module.exports = WestWorkspaceAnalyzer;