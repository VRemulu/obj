/**
 * STLLoader - 独立版本，不使用ES6模块
 * 基于Three.js STLLoader修改
 */

(function() {
    'use strict';

    class STLLoader extends THREE.Loader {
        constructor(manager) {
            super(manager);
        }

        load(url, onLoad, onProgress, onError) {
            const scope = this;
            const loader = new THREE.FileLoader(scope.manager);
            loader.setPath(scope.path);
            loader.setResponseType('arraybuffer');
            loader.setRequestHeader(scope.requestHeader);
            loader.setWithCredentials(scope.withCredentials);

            loader.load(url, function(text) {
                try {
                    onLoad(scope.parse(text));
                } catch (e) {
                    if (onError) {
                        onError(e);
                    } else {
                        console.error(e);
                    }
                    scope.manager.itemError(url);
                }
            }, onProgress, onError);
        }

        parse(data) {
            function isBinary(data) {
                const reader = new DataView(data);
                const face_size = (32 / 8 * 3) + ((32 / 8 * 3) * 3) + (16 / 8);
                const n_faces = reader.getUint32(80, true);
                const expect = 80 + (32 / 8) + (n_faces * face_size);

                if (expect === reader.byteLength) {
                    return true;
                }

                // An ASCII STL data must begin with 'solid ' as the first six bytes.
                // However, ASCII STLs lacking the SPACE after the 'd' are known to exist.
                // So, check the first 5 bytes for 'solid'.

                // Several encodings, such as UTF-8, precede the text with up to 5 bytes:
                // https://en.wikipedia.org/wiki/Byte_order_mark#Byte_order_marks_by_encoding
                // Search for "solid" to start parsing from.

                const solid = [115, 111, 108, 105, 100]; // solid

                for (let off = 0; off < 5; off++) {
                    // If "solid" text is matched to the current offset, declare it to be an ASCII STL.
                    if (matchDataViewAt(solid, reader, off)) return false;
                }

                // Couldn't find "solid" text at the beginning; it is binary STL.
                return true;
            }

            function matchDataViewAt(query, reader, offset) {
                // Check if each byte in query matches the corresponding byte from the current offset
                for (let i = 0, il = query.length; i < il; i++) {
                    if (query[i] !== reader.getUint8(offset + i)) return false;
                }

                return true;
            }

            function parseBinary(data) {
                const reader = new DataView(data);
                const faces = reader.getUint32(80, true);

                let r, g, b, hasColors = false, colors;
                let defaultR, defaultG, defaultB, alpha;

                // process STL header
                // check for default color in header ("COLOR=rgba" sequence).

                for (let index = 0; index < 80 - 10; index++) {
                    if ((reader.getUint32(index, false) == 0x434F4C4F /*COLO*/) &&
                        (reader.getUint8(index + 4) == 0x52 /*'R'*/) &&
                        (reader.getUint8(index + 5) == 0x3D /*'='*/)) {

                        hasColors = true;
                        colors = new Float32Array(faces * 3 * 3);

                        defaultR = reader.getUint8(index + 6) / 255;
                        defaultG = reader.getUint8(index + 7) / 255;
                        defaultB = reader.getUint8(index + 8) / 255;
                        alpha = reader.getUint8(index + 9) / 255;
                    }
                }

                const dataOffset = 84;
                const faceLength = 12 * 4 + 2;

                const geometry = new THREE.BufferGeometry();

                const vertices = new Float32Array(faces * 3 * 3);
                const normals = new Float32Array(faces * 3 * 3);

                for (let face = 0; face < faces; face++) {
                    const start = dataOffset + face * faceLength;
                    const normalX = reader.getFloat32(start, true);
                    const normalY = reader.getFloat32(start + 4, true);
                    const normalZ = reader.getFloat32(start + 8, true);

                    if (hasColors) {
                        const packedColor = reader.getUint16(start + 48, true);

                        if ((packedColor & 0x8000) === 0) {
                            // facet has its own unique color
                            r = (packedColor & 0x1F) / 31;
                            g = ((packedColor >> 5) & 0x1F) / 31;
                            b = ((packedColor >> 10) & 0x1F) / 31;
                        } else {
                            r = defaultR;
                            g = defaultG;
                            b = defaultB;
                        }
                    }

                    for (let i = 1; i <= 3; i++) {
                        const vertexstart = start + i * 12;
                        const componentIdx = (face * 3 * 3) + ((i - 1) * 3);

                        vertices[componentIdx] = reader.getFloat32(vertexstart, true);
                        vertices[componentIdx + 1] = reader.getFloat32(vertexstart + 4, true);
                        vertices[componentIdx + 2] = reader.getFloat32(vertexstart + 8, true);

                        normals[componentIdx] = normalX;
                        normals[componentIdx + 1] = normalY;
                        normals[componentIdx + 2] = normalZ;

                        if (hasColors) {
                            colors[componentIdx] = r;
                            colors[componentIdx + 1] = g;
                            colors[componentIdx + 2] = b;
                        }
                    }
                }

                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

                if (hasColors) {
                    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                    geometry.hasColors = true;
                    geometry.alpha = alpha;
                }

                return geometry;
            }

            function parseASCII(data) {
                const geometry = new THREE.BufferGeometry();
                const patternSolid = /solid([\s\S]*?)endsolid/g;
                const patternFace = /facet([\s\S]*?)endfacet/g;
                const patternFloat = /[\s]+([+-]?(?:\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?)[\s]+/g;

                // Multi-solid ASCII STL
                const vertices = [];
                const normals = [];

                const patternName = /solid\s(.+)/;

                let result;

                let groupVertexesStart = 0;
                let groupCount = 0;
                const groupsWithName = [];

                while ((result = patternSolid.exec(data)) !== null) {
                    const solid = result[0];

                    const name = (result[1].match(patternName) || ['', ''])[1];
                    const groupVertexesCount = 0;

                    let result2;

                    while ((result2 = patternFace.exec(solid)) !== null) {
                        let vertexCountPerFace = 0;
                        let normalCountPerFace = 0;

                        const text = result2[0];
                        let result3;

                        while ((result3 = patternFloat.exec(text)) !== null) {
                            if (normalCountPerFace < 3) {
                                normals.push(parseFloat(result3[1]));
                                normalCountPerFace++;
                            } else {
                                vertices.push(parseFloat(result3[1]));
                                vertexCountPerFace++;
                            }
                        }

                        // every face have to own 3 vertices
                        if (vertexCountPerFace !== 9) {
                            console.error('THREE.STLLoader: Something isn\'t right with the normal of face number ' + (face + 1));
                        }
                    }

                    // all done, let's create the group
                    const start = groupVertexesStart;
                    const count = (vertices.length / 3) - groupVertexesStart;

                    groupsWithName.push({
                        name: name || '',
                        start: start,
                        count: count
                    });

                    groupVertexesStart += count;
                    groupCount++;
                }

                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

                if (groupsWithName.length > 0) {
                    for (let i = 0; i < groupsWithName.length; i++) {
                        const group = groupsWithName[i];
                        geometry.addGroup(group.start, group.count, i);
                    }

                    geometry.groupsWithName = groupsWithName;
                }

                return geometry;
            }

            function ensureString(buffer) {
                if (typeof buffer !== 'string') {
                    return THREE.LoaderUtils.decodeText(new Uint8Array(buffer));
                }

                return buffer;
            }

            function ensureBinary(buffer) {
                if (typeof buffer === 'string') {
                    const array_buffer = new Uint8Array(buffer.length);
                    for (let i = 0; i < buffer.length; i++) {
                        array_buffer[i] = buffer.charCodeAt(i) & 0xff; // implicitly assumes little-endian
                    }
                    return array_buffer.buffer || array_buffer;
                } else {
                    return buffer;
                }
            }

            // start parsing

            const binData = ensureBinary(data);

            return isBinary(binData) ? parseBinary(binData) : parseASCII(ensureString(data));
        }
    }

    // 将STLLoader添加到THREE命名空间
    THREE.STLLoader = STLLoader;

})();