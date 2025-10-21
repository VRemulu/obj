// 导管架保护电位显示系统
class PotentialViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.segments = new Map();
        this.segmentMeshes = new Map();
        this.isWireframe = false;
        
        // 默认节点电位值 - 基于需求文档的-600到-1200mV范围（leg11-leg16）
        this.nodeValues = [
            // leg11-leg16 (原有6个节点)
            -600, -700, -750, -850, -992.49, -1015.9,
            // leg21-leg26 (新增6个节点)
            -620, -720, -770, -870, -950, -1020,
            // leg31-leg36 (新增6个节点)  
            -640, -740, -790, -890, -970, -1040,
            // leg41-leg46 (新增6个节点)
            -660, -760, -810, -910, -990, -1060
        ];
        
        // 默认颜色范围 - 根据需求文档：-600mV(最深红色)到-1200mV(最深蓝色)
        this.colorRange = {
            red: -600,    // 红色对应的电位值（最正值）
            blue: -1200   // 蓝色对应的电位值（最负值）
        };
        
        // 节点指示器相关
        this.nodeIndicators = new Map(); // 存储节点箭头和标签
        this.nodePositions = []; // 节点位置数组
        this.showNodeIndicators = true; // 是否显示节点指示器
        
        // 预设节点位置（基于导管架结构的估算位置）
        this.defaultNodePositions = [
            { x: -400, y: 800, z: -400 },  // 节点1 - 顶层左前
            { x: 400, y: 800, z: -400 },   // 节点2 - 顶层右前
            { x: 400, y: 800, z: 400 },    // 节点3 - 顶层右后
            { x: -400, y: 800, z: 400 },   // 节点4 - 顶层左后
            { x: -400, y: 0, z: -400 },    // 节点5 - 底层左前
            { x: 400, y: 0, z: -400 },     // 节点6 - 底层右前
            { x: 400, y: 0, z: 400 }       // 节点7 - 底层右后
        ];
    }

    init() {
        this.initScene();
        this.initCamera();
        this.initRenderer();
        this.initControls();
        this.initLights();
        this.setupEventListeners();
        this.animate();
        
        console.log('电位显示系统初始化完成');
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);
        
        // 添加网格
        const gridHelper = new THREE.GridHelper(2000, 20, 0x888888, 0xcccccc);
        this.scene.add(gridHelper);
    }

    initCamera() {
        const container = document.getElementById('canvasContainer');
        this.camera = new THREE.PerspectiveCamera(
            75,
            container.clientWidth / container.clientHeight,
            0.1,
            50000
        );
        this.camera.position.set(2000, 2000, 2000);
    }

    initRenderer() {
        const container = document.getElementById('canvasContainer');
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
    }

    initControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 500;
        this.controls.maxDistance = 10000;
        this.controls.maxPolarAngle = Math.PI;
    }

    initLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        // 主方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1000, 1000, 1000);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // 补充光源
        const light2 = new THREE.DirectionalLight(0xffffff, 0.4);
        light2.position.set(-1000, 500, -1000);
        this.scene.add(light2);
    }

    // 加载STL文件
    async loadSTLFile(file) {
        this.showLoading();
        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            // 保存原始数据与文件类型
            this.lastArrayBuffer = arrayBuffer;
            this.lastFileType = 'stl';

            this.segments = this.parseSTLWithSegments(arrayBuffer);
            this.createSegmentMeshes();
            this.uprightModel();
            this.applyPotentialColors(); // 应用电位颜色
            this.updateSegmentsList();
            this.fitCameraToModel();
            this.inspectModel();
            console.log(`STL文件加载完成，共${this.segments.size}个段`);
        } catch (error) {
            console.error('加载STL文件失败:', error);
            alert('加载STL文件失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 加载OBJ文件
    async loadOBJFile(file) {
        this.showLoading();
        try {
            const text = await this.readFileAsText(file);
            // 保存文件类型（OBJ 为文本，lastArrayBuffer 可置空）
            this.lastArrayBuffer = null;
            this.lastFileType = 'obj';

            this.segments = this.parseOBJWithSegments(text);
            this.createSegmentMeshes();
            this.uprightModel();
            this.applyPotentialColors(); // 应用电位颜色
            this.updateSegmentsList();
            this.fitCameraToModel();
            this.inspectModel();
            console.log(`OBJ文件加载完成，共${this.segments.size}个段`);
        } catch (error) {
            console.error('加载OBJ文件失败:', error);
            alert('加载OBJ文件失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    // 读取文本文件（用于 OBJ）
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }

    parseSTLWithSegments(arrayBuffer) {
        if (this.isBinarySTL(arrayBuffer)) {
            console.log('检测到二进制STL文件');
            return this.parseBinarySTLWithSegments(arrayBuffer);
        } else {
            console.log('检测到ASCII STL文件');
            return this.parseASCIISTLWithSegments(arrayBuffer);
        }
    }

    isBinarySTL(arrayBuffer) {
        if (arrayBuffer.byteLength < 84) return false;
        
        const view = new DataView(arrayBuffer);
        const triangleCount = view.getUint32(80, true);
        const expectedSize = 84 + triangleCount * 50;
        
        return Math.abs(arrayBuffer.byteLength - expectedSize) < 1000;
    }

    parseBinarySTLWithSegments(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const triangleCount = view.getUint32(80, true);
        
        const vertices = [];
        const normals = [];
        
        for (let i = 0; i < triangleCount; i++) {
            const offset = 84 + i * 50;
            
            const nx = view.getFloat32(offset, true);
            const ny = view.getFloat32(offset + 4, true);
            const nz = view.getFloat32(offset + 8, true);
            
            for (let j = 0; j < 3; j++) {
                const vertexOffset = offset + 12 + j * 12;
                const x = view.getFloat32(vertexOffset, true);
                const y = view.getFloat32(vertexOffset + 4, true);
                const z = view.getFloat32(vertexOffset + 8, true);
                
                vertices.push(x, y, z);
                normals.push(nx, ny, nz);
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        
        console.log(`二进制STL解析完成，三角形数: ${triangleCount}`);
        
        // 按高度分成6段
        return this.segmentGeometryByHeight(geometry, 6);
    }

    parseASCIISTLWithSegments(arrayBuffer) {
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        const lines = text.split('\n');
        
        const segments = new Map();
        let currentSegment = null;
        let vertices = [];
        let normals = [];
        let currentNormal = null;
        
        for (let line of lines) {
            line = line.trim().toLowerCase();
            
            if (line.startsWith('solid')) {
                const segmentName = this.extractSegmentNameFromHeader(line);
                currentSegment = segmentName;
                vertices = [];
                normals = [];
            } else if (line.startsWith('facet normal')) {
                const parts = line.split(/\s+/);
                currentNormal = [
                    parseFloat(parts[2]),
                    parseFloat(parts[3]),
                    parseFloat(parts[4])
                ];
            } else if (line.startsWith('vertex')) {
                const parts = line.split(/\s+/);
                vertices.push(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                );
                if (currentNormal) {
                    normals.push(...currentNormal);
                }
            } else if (line.startsWith('endsolid')) {
                if (currentSegment && vertices.length > 0) {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                    
                    segments.set(currentSegment, {
                        geometry: geometry,
                        triangleCount: vertices.length / 9,
                        visible: true
                    });
                }
            }
        }
        
        if (segments.size === 0) {
            // 如果没有找到多个段，按高度分段
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            return this.segmentGeometryByHeight(geometry, 6);
        }
        
        return segments;
    }

    // 解析 OBJ，按对象/组分段
    parseOBJWithSegments(objText) {
        const lines = objText.split(/\r?\n/);
        const vertices = [];
        const normals = [];
        const segments = new Map();
    
        let currentName = 'OBJ段1';
        let currentFaces = [];
    
        const addSegmentFromFaces = (name, faces) => {
            if (faces.length === 0) return;
            const positions = [];
    
            const pushTriangle = (a,b,c) => {
                const va = vertices[a-1], vb = vertices[b-1], vc = vertices[c-1];
                positions.push(va[0],va[1],va[2], vb[0],vb[1],vb[2], vc[0],vc[1],vc[2]);
            };
    
            for (const face of faces) {
                if (face.length === 3) {
                    pushTriangle(face[0], face[1], face[2]);
                } else if (face.length === 4) {
                    // 简单四边形拆分
                    pushTriangle(face[0], face[1], face[2]);
                    pushTriangle(face[0], face[2], face[3]);
                } else if (face.length > 4) {
                    // 多边形：三角扇
                    for (let i = 2; i < face.length; i++) {
                        pushTriangle(face[0], face[i-1], face[i]);
                    }
                }
            }
    
            if (positions.length > 0) {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geometry.computeVertexNormals();
    
                // 计算轴与范围
                const pos = geometry.getAttribute('position').array;
                let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
                for (let i=0; i<pos.length; i+=3) {
                    const x=pos[i], y=pos[i+1], z=pos[i+2];
                    if (x<minX) minX=x; if (x>maxX) maxX=x;
                    if (y<minY) minY=y; if (y>maxY) maxY=y;
                    if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
                }
                const xRange = maxX-minX, yRange=maxY-minY, zRange=maxZ-minZ;
                let axisName='X', minRange=minX, maxRange=maxX;
                if (yRange>=xRange && yRange>=zRange) { axisName='Y'; minRange=minY; maxRange=maxY; }
                else if (zRange>=xRange && zRange>=yRange) { axisName='Z'; minRange=minZ; maxRange=maxZ; }
    
                // 根据名称自动识别段索引（leg11..leg46）
                 const segmentIndexByName = (() => {
                   const s = (name || '').toLowerCase().replace(/\s+/g, '');
                   // 完整两段数字：legXY（X为腿编号，Y为段编号）
                   let m = s.match(/^leg(\d)(\d)$/);
                   if (m) {
                     const legNo = parseInt(m[1], 10);  // 腿编号 1-4
                     const segNo = parseInt(m[2], 10);  // 段编号 1-6
                     if (legNo >= 1 && legNo <= 4 && segNo >= 1 && segNo <= 6) {
                       // 计算全局索引：leg1x -> 0-5, leg2x -> 6-11, leg3x -> 12-17, leg4x -> 18-23
                       return (legNo - 1) * 6 + (segNo - 1);
                     }
                   }
                   // 只有一个数字：legY（视为第一条腿的段编号）
                   m = s.match(/^leg(\d+)$/);
                   if (m) {
                     const segNo = parseInt(m[1], 10);
                     if (segNo >= 1 && segNo <= 6) return segNo - 1;
                   }
                   return undefined;
                 })();
    
                segments.set(name, {
                    geometry: geometry,
                    triangleCount: positions.length / 9,
                    visible: true,
                    axisRange: [minRange, maxRange],
                    segmentIndex: segmentIndexByName, // 用名称映射到 0..5，使所有腿按第一条腿的6段梯度着色
                    axis: axisName
                });
            }
        };
    
        for (let raw of lines) {
            const line = raw.trim();
            if (line.length === 0 || line.startsWith('#')) continue;
    
            const parts = line.split(/\s+/);
            const head = parts[0];
    
            if (head === 'v') {
                if (parts.length >= 4) {
                    vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
                }
            } else if (head === 'vn') {
                if (parts.length >= 4) {
                    normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
                }
            } else if (head === 'f') {
                const face = [];
                for (let i=1;i<parts.length;i++) {
                    // 支持 a/b/c、a//n、a 这类形式，取顶点索引 a
                    const token = parts[i];
                    const vIndexStr = token.split('/')[0];
                    const vIndex = parseInt(vIndexStr, 10);
                    if (!isNaN(vIndex)) face.push(vIndex);
                }
                if (face.length >= 3) {
                    currentFaces.push(face);
                }
            } else if (head === 'o' || head === 'g') {
                // 先把上一段 flush 成几何
                addSegmentFromFaces(currentName, currentFaces);
                // 开启新段
                currentName = parts.slice(1).join(' ') || `OBJ段${segments.size + 1}`;
                currentFaces = [];
            }
        }
    
        // 最后一段 flush
        addSegmentFromFaces(currentName, currentFaces);
    
        // 如果没有对象/组分段，按高度分段
        if (segments.size === 0 && vertices.length > 0) {
            const positions = [];
            // 将所有面写入 positions
            for (let face of currentFaces) {
                if (face.length >= 3) {
                    const pushTriangle = (a,b,c) => {
                        const va = vertices[a-1], vb = vertices[b-1], vc = vertices[c-1];
                        positions.push(va[0],va[1],va[2], vb[0],vb[1],vb[2], vc[0],vc[1],vc[2]);
                    };
                    if (face.length === 3) {
                        pushTriangle(face[0], face[1], face[2]);
                    } else if (face.length === 4) {
                        pushTriangle(face[0], face[1], face[2]);
                        pushTriangle(face[0], face[2], face[3]);
                    } else {
                        for (let i = 2; i < face.length; i++) {
                            pushTriangle(face[0], face[i-1], face[i]);
                        }
                    }
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.computeVertexNormals();
            return this.segmentGeometryByHeight(geometry, 6);
        }
    
        return segments;
    }

    extractSegmentNameFromHeader(headerString) {
        const cleanHeader = headerString.replace(/[^\w\s\u4e00-\u9fff]/g, '').trim();
        if (cleanHeader.length > 5) {
            return cleanHeader.substring(0, 20);
        }
        return 'unknown';
    }

    // 智能分段（6段对应7个节点）
    segmentGeometryByHeight(geometry, segmentCount = 6) {
        const segments = new Map();
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal ? geometry.attributes.normal.array : null;
        
        console.log(`开始智能分段，目标段数: ${segmentCount}`);
        
        // 计算模型的边界框
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        
        const xRange = maxX - minX;
        const yRange = maxY - minY;
        const zRange = maxZ - minZ;
        
        console.log(`模型范围: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}], Y[${minY.toFixed(2)}, ${maxY.toFixed(2)}], Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
        
        // 选择最大的维度进行分段
        let segmentAxis, segmentMin, segmentMax, segmentRange;
        let axisName;
        
        if (xRange >= yRange && xRange >= zRange) {
            segmentAxis = 0; // X轴
            segmentMin = minX;
            segmentMax = maxX;
            segmentRange = xRange;
            axisName = 'X';
        } else if (yRange >= zRange) {
            segmentAxis = 1; // Y轴
            segmentMin = minY;
            segmentMax = maxY;
            segmentRange = yRange;
            axisName = 'Y';
        } else {
            segmentAxis = 2; // Z轴
            segmentMin = minZ;
            segmentMax = maxZ;
            segmentRange = zRange;
            axisName = 'Z';
        }
        
        console.log(`选择${axisName}轴进行分段，范围: ${segmentRange.toFixed(2)}`);
        
        const segmentSize = segmentRange / segmentCount;
        
        // 为每个段创建几何体
        for (let s = 0; s < segmentCount; s++) {
            const segmentVertices = [];
            const segmentNormals = [];
            const segmentMin_current = segmentMin + s * segmentSize;
            const segmentMax_current = segmentMin + (s + 1) * segmentSize;
            
            // 收集属于当前段的三角形
            for (let i = 0; i < positions.length; i += 9) {
                // 获取三角形三个顶点在分段轴上的坐标
                const v1 = positions[i + segmentAxis];
                const v2 = positions[i + 3 + segmentAxis];
                const v3 = positions[i + 6 + segmentAxis];
                
                // 计算三角形中心点在分段轴上的坐标
                const center = (v1 + v2 + v3) / 3;
                
                // 如果三角形中心在当前段范围内，就包含这个三角形
                if (center >= segmentMin_current && center < segmentMax_current) {
                    // 添加三角形的三个顶点
                    for (let j = 0; j < 9; j++) {
                        segmentVertices.push(positions[i + j]);
                    }
                    
                    // 添加对应的法向量
                    if (normals) {
                        for (let j = 0; j < 9; j++) {
                            segmentNormals.push(normals[i + j]);
                        }
                    }
                }
            }
            
            if (segmentVertices.length > 0) {
                const segmentGeometry = new THREE.BufferGeometry();
                segmentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(segmentVertices, 3));
                if (segmentNormals.length > 0) {
                    segmentGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(segmentNormals, 3));
                } else {
                    segmentGeometry.computeVertexNormals();
                }
                
                const segmentName = `段${s + 1}`;
                segments.set(segmentName, {
                    geometry: segmentGeometry,
                    triangleCount: segmentVertices.length / 9,
                    visible: true,
                    axisRange: [segmentMin_current, segmentMax_current],
                    segmentIndex: s,
                    axis: axisName
                });
                
                console.log(`创建${segmentName}，${axisName}轴范围: [${segmentMin_current.toFixed(2)}, ${segmentMax_current.toFixed(2)}], 三角形数: ${segmentVertices.length / 9}`);
            }
        }
        
        console.log(`分段完成，共创建${segments.size}个段`);
        return segments;
    }

    // 根据电位值计算颜色 - 基于需求文档的-600到-1200mV范围
    // HSV到RGB转换函数
    hsvToRgb(h, s, v) {
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;
        
        let r, g, b;
        
        if (h >= 0 && h < 60) {
            r = c; g = x; b = 0;
        } else if (h >= 60 && h < 120) {
            r = x; g = c; b = 0;
        } else if (h >= 120 && h < 180) {
            r = 0; g = c; b = x;
        } else if (h >= 180 && h < 240) {
            r = 0; g = x; b = c;
        } else if (h >= 240 && h < 300) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
        
        return {
            r: r + m,
            g: g + m,
            b: b + m
        };
    }

    calculatePotentialColor(potential) {
        // 定义关键颜色节点
        const colorNodes = [
            { potential: -600,  hue: 0,   saturation: 1.0, value: 0.5 },  // 深红色
            { potential: -750,  hue: 0,   saturation: 1.0, value: 0.9 },  // 红色
            { potential: -900,  hue: 60,  saturation: 1.0, value: 0.9 },  // 黄色
            { potential: -1050, hue: 120, saturation: 1.0, value: 0.9 },  // 绿色
            { potential: -1200, hue: 240, saturation: 1.0, value: 0.8 }   // 蓝色
        ];
        
        // 边界处理
        if (potential >= colorNodes[0].potential) {
            // 深红色
            const node = colorNodes[0];
            const rgb = this.hsvToRgb(node.hue, node.saturation, node.value);
            return new THREE.Color(rgb.r, rgb.g, rgb.b);
        }
        if (potential <= colorNodes[colorNodes.length - 1].potential) {
            // 蓝色
            const node = colorNodes[colorNodes.length - 1];
            const rgb = this.hsvToRgb(node.hue, node.saturation, node.value);
            return new THREE.Color(rgb.r, rgb.g, rgb.b);
        }
        
        // 找到相邻的两个颜色节点进行插值
        for (let i = 0; i < colorNodes.length - 1; i++) {
            const node1 = colorNodes[i];
            const node2 = colorNodes[i + 1];
            
            if (potential >= node2.potential && potential <= node1.potential) {
                // 计算插值比例
                const ratio = (potential - node2.potential) / (node1.potential - node2.potential);
                
                // 插值HSV值
                let hue = node2.hue + (node1.hue - node2.hue) * ratio;
                const saturation = node2.saturation + (node1.saturation - node2.saturation) * ratio;
                const value = node2.value + (node1.value - node2.value) * ratio;
                
                // 处理色相的循环性（如果跨越0°/360°边界）
                if (Math.abs(node1.hue - node2.hue) > 180) {
                    if (node1.hue > node2.hue) {
                        hue = node2.hue + (node1.hue - 360 - node2.hue) * ratio;
                    } else {
                        hue = node2.hue + (node1.hue + 360 - node2.hue) * ratio;
                    }
                    if (hue < 0) hue += 360;
                    if (hue >= 360) hue -= 360;
                }
                
                // 转换HSV到RGB
                const rgb = this.hsvToRgb(hue, saturation, value);
                return new THREE.Color(rgb.r, rgb.g, rgb.b);
            }
        }
        
        // 默认返回中间值（不应该到达这里）
        const rgb = this.hsvToRgb(120, 1.0, 0.9);
        return new THREE.Color(rgb.r, rgb.g, rgb.b);
    }

    // 创建段的网格对象
    createSegmentMeshes() {
        this.clearSegmentMeshes();
        this.segments.forEach((segmentData, segmentName) => {
            const material = new THREE.MeshBasicMaterial({
                color: 0xf5f5f5,
                wireframe: this.isWireframe,
                transparent: false,
                vertexColors: true
            });
            // 兼容旧版 three.js（需要 THREE.VertexColors 常量）
            if (typeof THREE.VertexColors !== 'undefined') {
                material.vertexColors = THREE.VertexColors;
            } else {
                material.vertexColors = true;
            }
            const mesh = new THREE.Mesh(segmentData.geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // 缩小模型5倍
            mesh.scale.set(1, 1, 1);
            
            this.scene.add(mesh);
            
            this.segmentMeshes.set(segmentName, {
                mesh: mesh,
                material: material,
                visible: segmentData.visible,
                segmentIndex: segmentData.segmentIndex
            });
        });
        
        console.log(`创建了${this.segmentMeshes.size}个段网格`);
    }

    // 应用电位颜色
    applyPotentialColors() {
        console.log('开始应用电位颜色...');
        
        // 获取基础的6个节点电位值（从输入框读取）
        const baseNodeValues = [];
        for (let i = 1; i <= 6; i++) {
            const input = document.getElementById(`node${i}`);
            if (input) {
                baseNodeValues.push(parseFloat(input.value) || 0);
            } else {
                console.warn(`找不到node${i}的输入框`);
                baseNodeValues.push(-950); // 默认值
            }
        }
        
        // 为所有24个节点复制相同的电位值（每条腿桩使用相同的电位分布）
        this.nodeValues = [];
        for (let leg = 0; leg < 4; leg++) {
            // 每条腿桩都使用相同的6个电位值
            this.nodeValues.push(...baseNodeValues);
        }
        
        // 获取颜色范围设置
        const redInput = document.getElementById('redValue');
        const blueInput = document.getElementById('blueValue');
        if (redInput && blueInput) {
            this.colorRange.red = parseFloat(redInput.value) || -600;
            this.colorRange.blue = parseFloat(blueInput.value) || -1200;
        }
        
        console.log('基础电位值:', baseNodeValues);
        console.log('所有节点电位值:', this.nodeValues);
        console.log('颜色范围:', this.colorRange);
        console.log('段网格数量:', this.segmentMeshes.size);
        
        // 为每个段应用渐变色
        let coloredCount = 0;
        this.segmentMeshes.forEach((meshData, segmentName) => {
            const segmentIndex = meshData.segmentIndex;
            
            if (segmentIndex !== undefined && segmentIndex >= 0 && segmentIndex < this.nodeValues.length) {
                // 计算段在腿桩内的相对位置（0-5）
                const legIndex = Math.floor(segmentIndex / 6); // 腿桩编号 (0-3)
                const segmentInLeg = segmentIndex % 6; // 段在腿桩内的位置 (0-5)
                
                // 获取段的起始和结束节点电位值（使用基础的6个值）
                let startPotential, endPotential;
                
                if (segmentInLeg < 5) {
                    // 正常情况：使用相邻两个节点的电位值
                    startPotential = baseNodeValues[segmentInLeg];
                    endPotential = baseNodeValues[segmentInLeg + 1];
                } else {
                    // 最后一个段：使用最后一个节点的电位值作为统一颜色
                    startPotential = baseNodeValues[segmentInLeg];
                    endPotential = baseNodeValues[segmentInLeg];
                }
                
                // 应用渐变色到段的几何体
                this.applyGradientToSegment(meshData, startPotential, endPotential, segmentName);
                coloredCount++;
                
                console.log(`${segmentName} (腿${legIndex+1}段${segmentInLeg+1}): 电位渐变 ${startPotential} → ${endPotential}`);
             } else {
                 console.warn(`${segmentName}: 段索引无效 (${segmentIndex}) 或超出节点范围 (${this.nodeValues.length})`);
             }
         });
         
         console.log(`电位颜色应用完成，成功着色 ${coloredCount} 个段`);
         
         // 更新段列表显示
         this.updateSegmentsList();
         
         // 创建或更新节点指示器
         this.createNodeIndicators();
    }

    // 新增方法：为段应用渐变色
    applyGradientToSegment(meshData, startPotential, endPotential, segmentName) {
        const geometry = meshData.mesh.geometry;
        const positionAttribute = geometry.getAttribute('position');
        
        if (!positionAttribute) {
            console.error(`${segmentName}: 无法获取位置属性`);
            return;
        }
        
        // 获取段的边界信息
         const segmentData = this.segments.get(segmentName);
         if (!segmentData || !segmentData.axisRange) {
             console.error(`${segmentName}: 无法获取段数据`);
             return;
         }
         
         // 计算段的范围
         const [min, max] = segmentData.axisRange;
         const axis = segmentData.axis || 'Z';
        const range = max - min;
        
        // 创建颜色属性数组
        const vertexCount = positionAttribute.count;
        const colors = new Float32Array(vertexCount * 3);
        
        // 为每个顶点计算颜色
        for (let i = 0; i < vertexCount; i++) {
            // 获取顶点在分割轴上的位置
            let axisPosition;
            if (axis === 'X') {
                axisPosition = positionAttribute.getX(i);
            } else if (axis === 'Y') {
                axisPosition = positionAttribute.getY(i);
            } else { // Z
                axisPosition = positionAttribute.getZ(i);
            }
            
            // 计算顶点在段内的相对位置 (0-1)
            const t = Math.max(0, Math.min(1, (axisPosition - min) / range));
            
            // 线性插值计算电位值
            const vertexPotential = startPotential + (endPotential - startPotential) * t;
            
            // 计算对应的颜色
            const color = this.calculatePotentialColor(vertexPotential);
            
            // 设置顶点颜色
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        // 应用颜色属性到几何体（使用 Float32BufferAttribute 更兼容）
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        // 更新材质以使用顶点颜色（兼容不同 three.js 版本）
        if (meshData.material) {
            if (typeof THREE.VertexColors !== 'undefined') {
                meshData.material.vertexColors = THREE.VertexColors;
            } else {
                meshData.material.vertexColors = true;
            }
            meshData.material.needsUpdate = true;
        }
        
        console.log(`${segmentName}: 应用了 ${vertexCount} 个顶点的渐变色，轴向: ${axis}, 范围: ${min.toFixed(2)} - ${max.toFixed(2)}`);
    }

    clearSegmentMeshes() {
        this.segmentMeshes.forEach((meshData) => {
            this.scene.remove(meshData.mesh);
            meshData.material.dispose();
            meshData.mesh.geometry.dispose();
        });
        this.segmentMeshes.clear();
    }

    updateSegmentsList() {
        const segmentList = document.getElementById('segmentList');
        segmentList.innerHTML = '';
        
        if (this.segmentMeshes.size === 0) {
            segmentList.innerHTML = '<p style="text-align: center; color: #666;">请先加载模型</p>';
            return;
        }
        
        this.segmentMeshes.forEach((meshData, segmentName) => {
            const segmentIndex = meshData.segmentIndex;
            const item = document.createElement('div');
            item.className = 'segment-item';
            
            const colorDiv = document.createElement('div');
            colorDiv.className = 'segment-color';
            const color = meshData.material.color;
            colorDiv.style.backgroundColor = `rgb(${Math.round(color.r*255)}, ${Math.round(color.g*255)}, ${Math.round(color.b*255)})`;
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'segment-name';
            nameDiv.textContent = segmentName;
            
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'segment-range';
            if (segmentIndex !== undefined && segmentIndex < 6) {
                const startPotential = this.nodeValues[segmentIndex];
                const endPotential = this.nodeValues[segmentIndex + 1];
                rangeDiv.textContent = `${startPotential} → ${endPotential} mV`;
            }
            
            item.appendChild(colorDiv);
            item.appendChild(nameDiv);
            item.appendChild(rangeDiv);
            segmentList.appendChild(item);
        });
    }

    // 让模型竖直摆放（将最长轴对齐到 Y 轴）
    uprightModel() {
        if (this.segmentMeshes.size === 0) return;

        // 计算整体包围盒尺寸（基于当前几何，未旋转）
        const box = new THREE.Box3();
        this.segmentMeshes.forEach((meshData) => {
            if (meshData.visible) {
                box.expandByObject(meshData.mesh);
            }
        });
        const size = box.getSize(new THREE.Vector3());

        // 判定最长轴
        let longestAxis = 'X';
        if (size.y >= size.x && size.y >= size.z) {
            longestAxis = 'Y';
        } else if (size.z >= size.x && size.z >= size.y) {
            longestAxis = 'Z';
        }

        // 根据最长轴将模型旋转到 Y 轴为竖直
        this.segmentMeshes.forEach((meshData) => {
            const mesh = meshData.mesh;
            // 重置旋转，避免重复调用导致累计旋转
            mesh.rotation.set(0, 0, 0);
            if (longestAxis === 'X') {
                // X -> Y：绕 Z 轴旋转 +90°
                mesh.rotation.z = Math.PI / 2;
            } else if (longestAxis === 'Z') {
                // Z -> Y：绕 X 轴旋转 -90°
                mesh.rotation.x = -Math.PI / 2;
            } else {
                // 已为 Y 轴，无需旋转
            }
        });

        console.log(`uprightModel: 将最长轴 ${longestAxis} 旋转对齐到 Y 轴，使模型竖直显示`);
    }

    fitCameraToModel() {
        if (this.segmentMeshes.size === 0) return;
        
        const box = new THREE.Box3();
        this.segmentMeshes.forEach((meshData) => {
            if (meshData.visible) {
                box.expandByObject(meshData.mesh);
            }
        });
        
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const distance = maxDim * 2.5;
        
        this.camera.position.copy(center);
        this.camera.position.x += distance;
        this.camera.position.y += distance * 0.8;
        this.camera.position.z += distance;
        
        this.controls.target.copy(center);
        this.controls.update();
        
        console.log(`模型尺寸: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
        console.log(`相机距离: ${distance.toFixed(2)}`);
    }

    // 遍历并输出模型结构信息
    inspectModel() {
        if (!this.segments || this.segments.size === 0) {
            console.warn('未加载模型，无法遍历结构');
            return;
        }

        const format = this.lastFileType === 'obj'
            ? 'OBJ'
            : (this.lastFileType === 'stl'
                ? (this.lastArrayBuffer ? (this.isBinarySTL(this.lastArrayBuffer) ? 'Binary STL' : 'ASCII STL') : 'STL')
                : '未知');

        // 整体包围盒
        const box = new THREE.Box3();
        this.segmentMeshes.forEach((meshData) => {
            if (meshData.visible) {
                box.expandByObject(meshData.mesh);
            }
        });
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        let totalTriangles = 0;
        const rows = [];

        this.segments.forEach((segmentData, segmentName) => {
            const geom = segmentData.geometry;
            const pos = geom.getAttribute('position').array;
            let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
            for (let i=0; i<pos.length; i+=3) {
                const x=pos[i], y=pos[i+1], z=pos[i+2];
                if (x<minX) minX=x; if (x>maxX) maxX=x;
                if (y<minY) minY=y; if (y>maxY) maxY=y;
                if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
            }
            const triCount = pos.length / 9;
            totalTriangles += triCount;
            rows.push({
                name: segmentName,
                triangles: triCount,
                axis: segmentData.axis || '-',
                axisRange: segmentData.axisRange ? `${segmentData.axisRange[0].toFixed(2)} ~ ${segmentData.axisRange[1].toFixed(2)}` : '-',
                bbox_min: `(${minX.toFixed(2)}, ${minY.toFixed(2)}, ${minZ.toFixed(2)})`,
                bbox_max: `(${maxX.toFixed(2)}, ${maxY.toFixed(2)}, ${maxZ.toFixed(2)})`,
                visible: segmentData.visible !== false
            });
        });

        console.log('模型格式:', format);
        console.log(`总段数: ${this.segments.size}, 总三角数: ${totalTriangles}`);
        console.log(`整体包围盒中心: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), 尺寸: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
        console.table(rows);
    }

    toggleWireframe() {
        this.isWireframe = !this.isWireframe;
        this.segmentMeshes.forEach((meshData) => {
            meshData.material.wireframe = this.isWireframe;
        });
    }

    resetView() {
        this.camera.position.set(2000, 2000, 2000);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    async loadDefaultModel() {
        try {
            const response = await fetch('4Leg.obj');
            if (!response.ok) {
                throw new Error('默认模型文件不存在');
            }
            const text = await response.text();
            
            // 保存文件类型（OBJ 为文本，lastArrayBuffer 可置空）
            this.lastArrayBuffer = null;
            this.lastFileType = 'obj';
            this.showLoading();
            this.segments = this.parseOBJWithSegments(text);
            this.createSegmentMeshes();
            this.uprightModel();
            this.applyPotentialColors(); // 应用电位颜色
            this.updateSegmentsList();
            this.fitCameraToModel();
            
            // 自动显示节点指示器
            this.showNodeIndicators = true;
            this.createNodeIndicators();
            
            console.log('默认模型加载完成');
        } catch (error) {
            console.error('加载默认模型失败:', error);
            alert('加载默认模型失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        document.getElementById('loading').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    setupEventListeners() {
        // 文件输入 - 添加元素存在性检查
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const ext = (file.name.split('.').pop() || '').toLowerCase();
                    if (ext === 'stl') {
                        this.loadSTLFile(file);
                    } else if (ext === 'obj') {
                        this.loadOBJFile(file);
                    } else {
                        alert('不支持的文件类型: ' + ext + '，请上传 .stl 或 .obj');
                    }
                }
            });
        }

        // 为节点电位值输入框添加实时更新监听器
        for (let i = 1; i <= 6; i++) {
            const nodeInput = document.getElementById(`node${i}`);
            if (nodeInput) {
                nodeInput.addEventListener('input', () => {
                    // 延迟更新，避免频繁计算
                    clearTimeout(this.updateTimeout);
                    this.updateTimeout = setTimeout(() => {
                        this.applyPotentialColors();
                    }, 300);
                });
            }
        }

        // 为颜色范围输入框添加实时更新监听器
        const redInput = document.getElementById('redValue');
        const blueInput = document.getElementById('blueValue');
        if (redInput) {
            redInput.addEventListener('input', () => {
                clearTimeout(this.updateTimeout);
                this.updateTimeout = setTimeout(() => {
                    this.applyPotentialColors();
                }, 300);
            });
        }
        if (blueInput) {
            blueInput.addEventListener('input', () => {
                clearTimeout(this.updateTimeout);
                this.updateTimeout = setTimeout(() => {
                    this.applyPotentialColors();
                }, 300);
            });
        }

        // 窗口大小调整
        window.addEventListener('resize', () => {
            this.onWindowResize();
        });
    }

    onWindowResize() {
        const container = document.getElementById('canvasContainer');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // 检测leg部件的实际位置
    // 计算模型的包围盒
    calculateModelBoundingBox() {
        const box = new THREE.Box3();
        
        // 遍历所有segments来计算整体包围盒
        this.segments.forEach((segmentData, segmentName) => {
            const geometry = segmentData.geometry;
            if (geometry) {
                const tempBox = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
                box.union(tempBox);
            }
        });
        
        console.log('模型包围盒:', box);
        return box;
    }
    
    // 将3D位置映射到包围盒外围
    mapPositionToBoundingBoxSurface(position, boundingBox, offset = 0) {
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        const min = boundingBox.min;
        const max = boundingBox.max;
        
        // 计算从中心到位置的方向向量
        const direction = position.clone().sub(center);
        
        // 如果方向向量为零，返回中心点
        if (direction.length() === 0) {
            return center.clone().add(new THREE.Vector3(0, 0, offset));
        }
        
        // 计算与包围盒各个面的交点
        const t = [];
        
        // X轴面
        if (direction.x !== 0) {
            const tx1 = (min.x - center.x) / direction.x;
            const tx2 = (max.x - center.x) / direction.x;
            if (tx1 > 0) t.push({t: tx1, axis: 'x', face: 'min'});
            if (tx2 > 0) t.push({t: tx2, axis: 'x', face: 'max'});
        }
        
        // Y轴面
        if (direction.y !== 0) {
            const ty1 = (min.y - center.y) / direction.y;
            const ty2 = (max.y - center.y) / direction.y;
            if (ty1 > 0) t.push({t: ty1, axis: 'y', face: 'min'});
            if (ty2 > 0) t.push({t: ty2, axis: 'y', face: 'max'});
        }
        
        // Z轴面
        if (direction.z !== 0) {
            const tz1 = (min.z - center.z) / direction.z;
            const tz2 = (max.z - center.z) / direction.z;
            if (tz1 > 0) t.push({t: tz1, axis: 'z', face: 'min'});
            if (tz2 > 0) t.push({t: tz2, axis: 'z', face: 'max'});
        }
        
        // 找到最小的正t值（最近的交点）
        if (t.length === 0) {
            // 如果没有交点，返回边界上的点
            const normalizedDir = direction.clone().normalize();
            const surfacePoint = center.clone().add(normalizedDir.multiplyScalar(Math.min(size.x, size.y, size.z) * 0.5));
            return surfacePoint.add(normalizedDir.multiplyScalar(offset));
        }
        
        t.sort((a, b) => a.t - b.t);
        const minT = t[0];
        
        // 计算交点
        const intersectionPoint = center.clone().add(direction.clone().multiplyScalar(minT.t));
        
        // 计算法向量
        let normal = new THREE.Vector3();
        if (minT.axis === 'x') {
            normal.x = minT.face === 'max' ? 1 : -1;
        } else if (minT.axis === 'y') {
            normal.y = minT.face === 'max' ? 1 : -1;
        } else if (minT.axis === 'z') {
            normal.z = minT.face === 'max' ? 1 : -1;
        }
        
        // 应用偏移
        if (offset !== 0) {
            intersectionPoint.add(normal.multiplyScalar(offset));
        }
        
        return intersectionPoint;
    }

    // 创建包围盒框架
    createBoundingBoxFrame(boundingBox) {
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        
        // 创建包围盒几何体
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        
        // 创建线框材质
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffff00, // 黄色
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        
        const wireframe = new THREE.LineSegments(edges, material);
        wireframe.position.copy(center);
        
        return wireframe;
    }

    // 创建节点3D模型
    createNodeModel(position, legName, value) {
        const group = new THREE.Group();
        
        // 创建圆柱体作为节点模型
        const cylinderGeometry = new THREE.CylinderGeometry(8, 8, 16, 16);
        const cylinderMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00aaff,
            transparent: true,
            opacity: 0.9
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        
        // 创建顶部的球体
        const sphereGeometry = new THREE.SphereGeometry(10, 16, 16);
        const sphereMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff6600,
            transparent: true,
            opacity: 0.9
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.y = 8;
        
        // 创建文本标签
        const labelText = `${legName}\n${value.toFixed(1)}mV`;
        const label = this.createTextLabel(labelText, new THREE.Vector3(0, 25, 0));
        
        // 组合模型
        group.add(cylinder);
        group.add(sphere);
        group.add(label);
        group.position.copy(position);
        
        return group;
    }

    // 创建不包含标签的节点模型
    createNodeModelWithoutLabel(position) {
        const group = new THREE.Group();
        
        // 创建圆柱体作为节点模型
        const cylinderGeometry = new THREE.CylinderGeometry(8, 8, 16, 16);
        const cylinderMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00aaff,
            transparent: true,
            opacity: 0.9
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        
        // 隐藏顶部的球体（球体被标签替代）
        // const sphereGeometry = new THREE.SphereGeometry(10, 16, 16);
        // const sphereMaterial = new THREE.MeshPhongMaterial({ 
        //     color: 0xff6600,
        //     transparent: true,
        //     opacity: 0.9
        // });
        // const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        // sphere.position.y = 8;
        
        // 组合模型（不包含标签和球体）
        group.add(cylinder);
        // group.add(sphere); // 隐藏球体
        group.position.copy(position);
        
        return group;
    }

    detectLegPositions() {
        const legPositions = [];
        
        // 定义要检测的leg部件名称（对应24个节点：leg11-leg16, leg21-leg26, leg31-leg36, leg41-leg46）
        const legNames = [
            // leg11-leg16 (原有6个节点)
            'leg11', 'leg12', 'leg13', 'leg14', 'leg15', 'leg16',
            // leg21-leg26 (新增6个节点)
            'leg21', 'leg22', 'leg23', 'leg24', 'leg25', 'leg26',
            // leg31-leg36 (新增6个节点)
            'leg31', 'leg32', 'leg33', 'leg34', 'leg35', 'leg36',
            // leg41-leg46 (新增6个节点)
            'leg41', 'leg42', 'leg43', 'leg44', 'leg45', 'leg46'
        ];
        
        console.log('开始检测leg位置，segments数量:', this.segments.size);
        
        // 尝试找到每个具体的leg节点
        for (let i = 0; i < legNames.length; i++) {
            const legName = legNames[i];
            let foundPosition = null;
            
            // 首先尝试直接匹配leg名称
            this.segments.forEach((segmentData, segmentName) => {
                if (segmentName.toLowerCase() === legName.toLowerCase()) {
                    console.log(`直接找到leg部件: ${segmentName}`);
                    foundPosition = this.calculateSegmentCenter(segmentData.geometry);
                }
            });
            
            // 如果没有直接找到，尝试模糊匹配
            if (!foundPosition) {
                this.segments.forEach((segmentData, segmentName) => {
                    if (segmentName.toLowerCase().includes(legName.toLowerCase())) {
                        console.log(`模糊匹配找到leg部件: ${segmentName} -> ${legName}`);
                        foundPosition = this.calculateSegmentCenter(segmentData.geometry);
                    }
                });
            }
            
            if (foundPosition) {
                legPositions.push(foundPosition);
                console.log(`${legName} 位置:`, foundPosition);
            } else {
                console.warn(`未找到 ${legName}，使用计算位置`);
                // 如果找不到具体的leg，基于模型整体高度计算位置
                const modelBounds = this.calculateModelBoundingBox();
                const modelHeight = modelBounds.max.y - modelBounds.min.y;
                const nodeY = modelBounds.min.y + (modelHeight / 24) * (i + 0.5);
                
                // 尝试在模型周围分布节点（24个节点分布）
                const angle = (i / 24) * Math.PI * 2;
                const radius = Math.max(
                    modelBounds.max.x - modelBounds.min.x,
                    modelBounds.max.z - modelBounds.min.z
                ) * 0.4;
                
                const nodeX = Math.cos(angle) * radius;
                const nodeZ = Math.sin(angle) * radius;
                
                const calculatedPosition = new THREE.Vector3(nodeX, nodeY, nodeZ);
                legPositions.push(calculatedPosition);
                console.log(`${legName} 计算位置:`, calculatedPosition);
            }
        }
        
        console.log('最终检测到的leg位置:', legPositions);
        console.log('返回位置数组长度:', legPositions.length);
        return legPositions;
    }
    
    // 计算segment的中心位置
    calculateSegmentCenter(geometry) {
        const positionAttribute = geometry.getAttribute('position');
        if (!positionAttribute) return new THREE.Vector3(0, 0, 0);
        
        const positions = positionAttribute.array;
        let sumX = 0, sumY = 0, sumZ = 0;
        const vertexCount = positions.length / 3;
        
        for (let i = 0; i < positions.length; i += 3) {
            sumX += positions[i];
            sumY += positions[i + 1];
            sumZ += positions[i + 2];
        }
        
        return new THREE.Vector3(
            sumX / vertexCount,
            sumY / vertexCount,
            sumZ / vertexCount
        );
    }
    
    // 获取节点对应的leg名称
    getLegNameForNode(nodeIndex) {
        const legNames = ['leg11', 'leg21', 'leg31', 'leg41', 'leg12', 'leg22', 'leg32'];
        return legNames[nodeIndex - 1] || `节点${nodeIndex}`;
    }
    
    // 创建水平箭头指示器（与垂直腿部垂直）
    createVerticalArrowIndicator(position) {
        const group = new THREE.Group();
        
        // 创建箭头头部（水平指向右）
        const arrowGeometry = new THREE.ConeGeometry(20, 50, 8);
        const arrowMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff3300, // 红色，更醒目
            transparent: true,
            opacity: 0.9
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        
        // 将箭头旋转90度，使其水平指向右
        arrow.rotation.z = -Math.PI / 2;
        arrow.position.x = 75; // 箭头在杆的右端
        
        // 创建箭头杆（水平）
        const shaftGeometry = new THREE.CylinderGeometry(4, 4, 80);
        const shaftMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff3300, // 红色
            transparent: true,
            opacity: 0.9
        });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        
        // 将杆旋转90度，使其水平
        shaft.rotation.z = Math.PI / 2;
        shaft.position.x = 40; // 杆的中心位置
        
        // 创建一个小圆点标记箭头起点
        const dotGeometry = new THREE.SphereGeometry(8, 16, 16);
        const dotMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff3300,
            transparent: true,
            opacity: 0.9
        });
        const dot = new THREE.Mesh(dotGeometry, dotMaterial);
        dot.position.x = 0; // 在箭头起点
        
        group.add(arrow);
        group.add(shaft);
        group.add(dot);
        
        // 设置整个组的位置
        group.position.copy(position);
        
        return group;
    }

    // 创建方向性箭头（从起点指向终点）
    createDirectionalArrow(startPosition, endPosition) {
        const group = new THREE.Group();
        
        // 计算方向向量
        const direction = new THREE.Vector3().subVectors(endPosition, startPosition);
        const distance = direction.length();
        direction.normalize();
        
        // 创建箭头线（从起点到终点的85%）
        const lineLength = distance * 0.85;
        const lineGeometry = new THREE.CylinderGeometry(4, 4, lineLength);
        const lineMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x00aa00, // 绿色线条
            transparent: true,
            opacity: 0.8
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        
        // 创建箭头头部
        const arrowHeadGeometry = new THREE.ConeGeometry(15, 35, 8);
        const arrowHeadMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff3300, // 红色箭头头部
            transparent: true,
            opacity: 0.9
        });
        const arrowHead = new THREE.Mesh(arrowHeadGeometry, arrowHeadMaterial);
        
        // 隐藏起点标记（小球）
        // const startMarkerGeometry = new THREE.SphereGeometry(10, 16, 16);
        // const startMarkerMaterial = new THREE.MeshLambertMaterial({ 
        //     color: 0x0066ff, // 蓝色起点标记
        //     transparent: true,
        //     opacity: 0.9
        // });
        // const startMarker = new THREE.Mesh(startMarkerGeometry, startMarkerMaterial);
        
        // 计算旋转角度，使箭头指向正确方向
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        
        // 设置线的位置和旋转
        line.position.copy(startPosition).add(direction.clone().multiplyScalar(lineLength / 2));
        line.quaternion.copy(quaternion);
        
        // 设置箭头头部的位置和旋转
        arrowHead.position.copy(startPosition).add(direction.clone().multiplyScalar(lineLength + 17.5));
        arrowHead.quaternion.copy(quaternion);
        
        // 隐藏起点标记位置设置
        // startMarker.position.copy(startPosition);
        
        group.add(line);
        group.add(arrowHead);
        // group.add(startMarker); // 隐藏蓝色球体
        
        return group;
    }

    // 创建箭头指示器
    createArrowIndicator(position, nodeIndex, value) {
        const group = new THREE.Group();
        
        // 创建箭头几何体
        const arrowGeometry = new THREE.ConeGeometry(20, 60, 8);
        const arrowMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6b35,
            transparent: true,
            opacity: 0.8
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        
        // 箭头指向下方
        arrow.rotation.x = Math.PI;
        arrow.position.y = 100; // 箭头在节点上方
        
        // 创建箭头杆
        const shaftGeometry = new THREE.CylinderGeometry(5, 5, 80);
        const shaftMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6b35,
            transparent: true,
            opacity: 0.8
        });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        shaft.position.y = 40; // 杆在箭头下方
        
        group.add(arrow);
        group.add(shaft);
        
        // 设置组的位置
        group.position.set(position.x, position.y, position.z);
        
        return group;
    }

    // 创建文本标签
    createTextLabel(text, position) {
        // 创建canvas来绘制文本
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 300;
        canvas.height = 150;
        
        // 设置字体和样式
        context.font = 'Bold 28px Arial';
        context.fillStyle = 'rgba(255, 255, 255, 0.95)';
        context.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        context.lineWidth = 4;
        
        // 绘制圆角背景
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const radius = 15;
        const x = 10, y = 10, width = canvas.width - 20, height = canvas.height - 20;
        
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
        context.fill();
        
        // 绘制文本（支持多行）
        context.fillStyle = 'rgba(255, 255, 255, 0.95)';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        const lines = text.split('\n');
        const lineHeight = 35;
        const startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
        
        lines.forEach((line, index) => {
            const y = startY + index * lineHeight;
            context.strokeText(line, canvas.width / 2, y);
            context.fillText(line, canvas.width / 2, y);
        });
        
        // 创建纹理和材质
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            alphaTest: 0.1
        });
        
        // 创建精灵
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position); // 标签直接放在映射位置
        sprite.scale.set(120, 60, 1); // 调整标签大小，适中醒目
        
        return sprite;
    }

    // 创建所有节点指示器
    createNodeIndicators() {
        console.log('开始创建节点指示器...');
        
        // 清除现有的指示器
        this.clearNodeIndicators();
        
        // 计算模型包围盒
        const boundingBox = this.calculateModelBoundingBox();
        
        // 隐藏包围盒框架
        // const boundingBoxFrame = this.createBoundingBoxFrame(boundingBox);
        // this.scene.add(boundingBoxFrame);
        
        // 检测实际的leg节点位置
        const actualNodePositions = this.detectLegPositions();
        
        // leg11-leg16, leg21-leg26, leg31-leg36, leg41-leg46的名称
        const legNames = [
            // leg11-leg16 (原有6个节点)
            'leg11', 'leg12', 'leg13', 'leg14', 'leg15', 'leg16',
            // leg21-leg26 (新增6个节点)
            'leg21', 'leg22', 'leg23', 'leg24', 'leg25', 'leg26',
            // leg31-leg36 (新增6个节点)
            'leg31', 'leg32', 'leg33', 'leg34', 'leg35', 'leg36',
            // leg41-leg46 (新增6个节点)
            'leg41', 'leg42', 'leg43', 'leg44', 'leg45', 'leg46'
        ];
        
        console.log('将节点映射到包围盒边框上，箭头从外侧指向节点');
        console.log('模型包围盒:', boundingBox);
        console.log('实际节点位置数量:', actualNodePositions.length);
        
        // 确保我们有足够的位置来创建24个节点
        // 如果actualNodePositions不足24个，我们需要生成额外的位置
        const allNodePositions = [...actualNodePositions];
        
        // 如果实际位置不足24个，生成额外的计算位置
        if (allNodePositions.length < 24) {
            const modelBounds = this.calculateModelBoundingBox();
            const modelHeight = modelBounds.max.y - modelBounds.min.y;
            
            for (let i = allNodePositions.length; i < 24; i++) {
                const nodeY = modelBounds.min.y + (modelHeight / 24) * (i + 0.5);
                const angle = (i / 24) * Math.PI * 2;
                const radius = Math.max(
                    modelBounds.max.x - modelBounds.min.x,
                    modelBounds.max.z - modelBounds.min.z
                ) * 0.4;
                
                const nodeX = Math.cos(angle) * radius;
                const nodeZ = Math.sin(angle) * radius;
                
                allNodePositions.push(new THREE.Vector3(nodeX, nodeY, nodeZ));
            }
        }
        
        console.log('准备创建24个节点，实际位置数量:', actualNodePositions.length, '总位置数量:', allNodePositions.length);
        
        for (let i = 0; i < Math.min(24, this.nodeValues.length); i++) {
            const actualPosition = allNodePositions[i]; // 实际节点位置（用于映射参考）
            
            // 将节点映射到包围盒边框上（偏移量为0，直接在边框上）
            const nodePositionOnBBox = this.mapPositionToBoundingBoxSurface(actualPosition, boundingBox, 0);
            
            // 箭头起始位置（延长一倍，距离边框60单位）
            const arrowStartPosition = this.mapPositionToBoundingBoxSurface(actualPosition, boundingBox, 60);
            
            // 标签位置移动到杆末端90单位
            const labelPosition = this.mapPositionToBoundingBoxSurface(actualPosition, boundingBox, 90);
            
            const value = this.nodeValues[i];
            const nodeIndex = i + 1;
            const legName = legNames[i];
            
            console.log(`${legName} - 实际位置:`, actualPosition);
            console.log(`${legName} - 包围盒边框位置:`, nodePositionOnBBox);
            console.log(`${legName} - 箭头起始位置:`, arrowStartPosition, `值: ${value.toFixed(1)}mV`);
            console.log(`${legName} - 标签位置:`, labelPosition);
            
            // 创建3D节点模型（放在包围盒边框上，不包含标签）
            const nodeModel = this.createNodeModelWithoutLabel(nodePositionOnBBox);
            
            // 创建从外侧指向包围盒边框节点的箭头（使用缩短的起始位置）
            const arrow = this.createDirectionalArrow(arrowStartPosition, nodePositionOnBBox);
            
            // 创建文本标签，放置在原始位置（不缩短）
            const labelText = `${legName}\n${value.toFixed(1)}mV`;
            const label = this.createTextLabel(labelText, labelPosition.clone());
            
            // 创建组合对象
            const indicator = new THREE.Group();
            indicator.add(arrow);
            indicator.add(nodeModel);
            indicator.add(label);
            
            // 添加到场景
            this.scene.add(indicator);
            console.log(`${legName}指示器已添加到场景`);
            
            // 保存引用
            this.nodeIndicators.set(nodeIndex, {
                group: indicator,
                arrow: arrow,
                nodeModel: nodeModel,
                actualPosition: actualPosition,
                nodePositionOnBBox: nodePositionOnBBox,
                arrowStartPosition: arrowStartPosition,
                labelPosition: labelPosition,
                legName: legName
            });
        }
        
        // 隐藏包围盒框架引用保存
        // this.boundingBoxFrame = boundingBoxFrame;
        
        console.log(`创建了 ${this.nodeIndicators.size} 个节点指示器`);
    }

    // 清除节点指示器
    clearNodeIndicators() {
        this.nodeIndicators.forEach((indicatorData) => {
            if (indicatorData.group) {
                this.scene.remove(indicatorData.group);
            } else {
                // 兼容旧格式
                this.scene.remove(indicatorData);
            }
        });
        this.nodeIndicators.clear();
        
        // 清除包围盒框架
        if (this.boundingBoxFrame) {
            this.scene.remove(this.boundingBoxFrame);
            this.boundingBoxFrame = null;
        }
    }

    // 更新节点指示器的数值显示
    updateNodeIndicators() {
        if (!this.showNodeIndicators) return;
        
        this.nodeIndicators.forEach((indicatorData, nodeIndex) => {
            const value = this.nodeValues[nodeIndex - 1];
            if (value !== undefined && indicatorData.label) {
                // 更新文本标签
                const label = indicatorData.label;
                if (label && label.material && label.material.map) {
                    // 重新创建文本纹理
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = 256;
                    canvas.height = 128;
                    
                    // 设置字体和样式
                    context.font = 'Bold 24px Arial';
                    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                    context.lineWidth = 3;
                    
                    // 绘制文本背景
                    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // 绘制文本
                    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    const labelText = `${indicatorData.legName}\n${value.toFixed(1)}mV`;
                    const lines = labelText.split('\n');
                    lines.forEach((line, index) => {
                        const y = canvas.height / 2 + (index - 0.5) * 30;
                        context.strokeText(line, canvas.width / 2, y);
                        context.fillText(line, canvas.width / 2, y);
                    });
                    
                    // 更新纹理
                    label.material.map.image = canvas;
                    label.material.map.needsUpdate = true;
                }
            }
        });
    }

    // 切换节点指示器显示/隐藏
    toggleNodeIndicators() {
        this.showNodeIndicators = !this.showNodeIndicators;
        
        if (this.showNodeIndicators) {
            this.createNodeIndicators();
        } else {
            this.clearNodeIndicators();
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// 全局变量
let viewer;

// 全局函数
function loadDefaultModel() {
    if (viewer) {
        viewer.loadDefaultModel();
    }
}

function resetView() {
    if (viewer) {
        viewer.resetView();
    }
}

function toggleWireframe() {
    if (viewer) {
        viewer.toggleWireframe();
    }
}

function updateColors() {
    if (viewer) {
        viewer.applyPotentialColors();
    }
}

function inspectModel() {
    if (viewer) {
        viewer.inspectModel();
    }
}

function toggleNodeIndicators() {
    if (viewer) {
        viewer.toggleNodeIndicators();
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    viewer = new PotentialViewer();
    viewer.init();
    console.log('电位显示系统已启动');
    
    // 自动加载默认模型
    viewer.loadDefaultModel();
});