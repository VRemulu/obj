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
        
        // 默认节点电位值 - 基于需求文档的-600到-1200mV范围
        this.nodeValues = [-600, -700, -800, -900, -1000, -1100, -1200];
        
        // 默认颜色范围 - 根据需求文档：-600mV(最深红色)到-1200mV(最深蓝色)
        this.colorRange = {
            red: -600,    // 红色对应的电位值（最正值）
            blue: -1200   // 蓝色对应的电位值（最负值）
        };
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
                   let m = s.match(/^leg(\d+)(\d+)$/);
                   if (m) {
                     const segNo = parseInt(m[2], 10);
                     if (segNo >= 1 && segNo <= 6) return segNo - 1;
                   }
                   // 只有一个数字：legY（视为段编号）
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
        
        // 获取当前的节点电位值
        this.nodeValues = [];
        for (let i = 1; i <= 7; i++) {
            const input = document.getElementById(`node${i}`);
            if (input) {
                this.nodeValues.push(parseFloat(input.value) || 0);
            } else {
                console.warn(`找不到节点${i}的输入框`);
                this.nodeValues.push(-950); // 默认值
            }
        }
        
        // 获取颜色范围设置
        const redInput = document.getElementById('redValue');
        const blueInput = document.getElementById('blueValue');
        if (redInput && blueInput) {
            this.colorRange.red = parseFloat(redInput.value) || -600;
            this.colorRange.blue = parseFloat(blueInput.value) || -1200;
        }
        
        console.log('节点电位值:', this.nodeValues);
        console.log('颜色范围:', this.colorRange);
        console.log('段网格数量:', this.segmentMeshes.size);
        
        // 为每个段应用渐变色
        let coloredCount = 0;
        this.segmentMeshes.forEach((meshData, segmentName) => {
            const segmentIndex = meshData.segmentIndex;
            
            if (segmentIndex !== undefined && segmentIndex < 6 && segmentIndex < this.nodeValues.length - 1) {
                // 获取段的起始和结束节点电位值
                const startPotential = this.nodeValues[segmentIndex];
                const endPotential = this.nodeValues[segmentIndex + 1];
                
                // 应用渐变色到段的几何体
                this.applyGradientToSegment(meshData, startPotential, endPotential, segmentName);
                coloredCount++;
                
                console.log(`${segmentName}: 电位渐变 ${startPotential} → ${endPotential}`);
             } else {
                 console.warn(`${segmentName}: 段索引无效 (${segmentIndex}) 或超出节点范围`);
             }
         });
         
         console.log(`电位颜色应用完成，成功着色 ${coloredCount} 个段`);
         
         // 更新段列表显示
         this.updateSegmentsList();
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
        // 文件输入
        const fileInput = document.getElementById('fileInput');
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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    viewer = new PotentialViewer();
    viewer.init();
    console.log('电位显示系统已启动');
    
    // 自动加载默认模型
    viewer.loadDefaultModel();
});