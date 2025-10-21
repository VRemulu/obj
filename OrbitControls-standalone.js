/**
 * OrbitControls - 独立版本，不使用ES6模块
 * 基于Three.js OrbitControls修改
 */

(function() {
    'use strict';

    const _changeEvent = { type: 'change' };
    const _startEvent = { type: 'start' };
    const _endEvent = { type: 'end' };

    const _STATE = {
        NONE: -1,
        ROTATE: 0,
        DOLLY: 1,
        PAN: 2,
        TOUCH_ROTATE: 3,
        TOUCH_PAN: 4,
        TOUCH_DOLLY_PAN: 5,
        TOUCH_DOLLY_ROTATE: 6
    };

    const _EPS = 0.000001;
    const _twoPI = 2 * Math.PI;

    class OrbitControls extends THREE.EventDispatcher {
        constructor(object, domElement = null) {
            super();

            this.object = object;
            this.domElement = domElement;

            // Set to false to disable this control
            this.enabled = true;

            // "target" sets the location of focus, where the object orbits around
            this.target = new THREE.Vector3();

            // How far you can dolly in and out ( PerspectiveCamera only )
            this.minDistance = 0;
            this.maxDistance = Infinity;

            // How far you can zoom in and out ( OrthographicCamera only )
            this.minZoom = 0;
            this.maxZoom = Infinity;

            // How far you can orbit vertically, upper and lower limits.
            this.minPolarAngle = 0; // radians
            this.maxPolarAngle = Math.PI; // radians

            // How far you can orbit horizontally, upper and lower limits.
            this.minAzimuthAngle = -Infinity; // radians
            this.maxAzimuthAngle = Infinity; // radians

            // Set to true to enable damping (inertia)
            this.enableDamping = false;
            this.dampingFactor = 0.05;

            // This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
            this.enableZoom = true;
            this.zoomSpeed = 1.0;

            // Set to false to disable rotating
            this.enableRotate = true;
            this.rotateSpeed = 1.0;

            // Set to false to disable panning
            this.enablePan = true;
            this.panSpeed = 1.0;
            this.screenSpacePanning = true; // if false, pan orthogonal to world-space direction camera.up

            // Set to true to automatically rotate around the target
            this.autoRotate = false;
            this.autoRotateSpeed = 2.0; // 30 seconds per orbit when fps is 60

            // The four arrow keys
            this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

            // Mouse buttons
            this.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

            // Touch fingers
            this.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

            // for reset
            this.target0 = this.target.clone();
            this.position0 = this.object.position.clone();
            this.zoom0 = this.object.zoom;

            // the target DOM element for key events
            this._domElementKeyEvents = null;

            // internals
            this._state = _STATE.NONE;
            this._scale = 1;
            this._panOffset = new THREE.Vector3();
            this._zoomChanged = false;

            this._rotateStart = new THREE.Vector2();
            this._rotateEnd = new THREE.Vector2();
            this._rotateDelta = new THREE.Vector2();

            this._panStart = new THREE.Vector2();
            this._panEnd = new THREE.Vector2();
            this._panDelta = new THREE.Vector2();

            this._dollyStart = new THREE.Vector2();
            this._dollyEnd = new THREE.Vector2();
            this._dollyDelta = new THREE.Vector2();

            this._spherical = new THREE.Spherical();
            this._sphericalDelta = new THREE.Spherical();

            this._quat = new THREE.Quaternion().setFromUnitVectors(object.up, new THREE.Vector3(0, 1, 0));
            this._quatInverse = this._quat.clone().invert();

            this._lastPosition = new THREE.Vector3();
            this._lastQuaternion = new THREE.Quaternion();

            this._pointers = [];
            this._pointerPositions = {};

            if (this.domElement !== null) {
                this.connect(this.domElement);
            }

            this.update();
        }

        connect(domElement) {
            this.domElement = domElement;
            this.domElement.style.touchAction = 'none'; // disable touch scroll

            this.domElement.addEventListener('contextmenu', this._onContextMenu);
            this.domElement.addEventListener('pointerdown', this._onPointerDown);
            this.domElement.addEventListener('pointercancel', this._onPointerUp);
            this.domElement.addEventListener('wheel', this._onMouseWheel);
        }

        disconnect() {
            if (this.domElement) {
                this.domElement.style.touchAction = 'auto';
                this.domElement.removeEventListener('contextmenu', this._onContextMenu);
                this.domElement.removeEventListener('pointerdown', this._onPointerDown);
                this.domElement.removeEventListener('pointercancel', this._onPointerUp);
                this.domElement.removeEventListener('wheel', this._onMouseWheel);
            }

            this.domElement = null;
        }

        dispose() {
            this.disconnect();
        }

        getPolarAngle() {
            return this._spherical.phi;
        }

        getAzimuthalAngle() {
            return this._spherical.theta;
        }

        getDistance() {
            return this.object.position.distanceTo(this.target);
        }

        saveState() {
            this.target0.copy(this.target);
            this.position0.copy(this.object.position);
            this.zoom0 = this.object.zoom;
        }

        reset() {
            this.target.copy(this.target0);
            this.object.position.copy(this.position0);
            this.object.zoom = this.zoom0;

            this.object.updateProjectionMatrix();
            this.dispatchEvent(_changeEvent);

            this.update();
            this._state = _STATE.NONE;
        }

        update() {
            const position = this.object.position;
            const offset = new THREE.Vector3();

            offset.copy(position).sub(this.target);
            offset.applyQuaternion(this._quat);

            this._spherical.setFromVector3(offset);

            if (this.autoRotate && this._state === _STATE.NONE) {
                this._rotateLeft(this._getAutoRotationAngle());
            }

            if (this.enableDamping) {
                this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
                this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
            } else {
                this._spherical.theta += this._sphericalDelta.theta;
                this._spherical.phi += this._sphericalDelta.phi;
            }

            // restrict theta to be between desired limits
            let min = this.minAzimuthAngle;
            let max = this.maxAzimuthAngle;

            if (isFinite(min) && isFinite(max)) {
                if (min < -Math.PI) min += _twoPI; else if (min > Math.PI) min -= _twoPI;
                if (max < -Math.PI) max += _twoPI; else if (max > Math.PI) max -= _twoPI;

                if (min <= max) {
                    this._spherical.theta = Math.max(min, Math.min(max, this._spherical.theta));
                } else {
                    this._spherical.theta = (this._spherical.theta > (min + max) / 2) ?
                        Math.max(min, this._spherical.theta) :
                        Math.min(max, this._spherical.theta);
                }
            }

            // restrict phi to be between desired limits
            this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));
            this._spherical.makeSafe();
            this._spherical.radius *= this._scale;

            // restrict radius to be between desired limits
            this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius));

            // move target to panned location
            if (this.enableDamping === true) {
                this.target.addScaledVector(this._panOffset, this.dampingFactor);
            } else {
                this.target.add(this._panOffset);
            }

            offset.setFromSpherical(this._spherical);
            offset.applyQuaternion(this._quatInverse);

            position.copy(this.target).add(offset);

            this.object.lookAt(this.target);

            if (this.enableDamping === true) {
                this._sphericalDelta.theta *= (1 - this.dampingFactor);
                this._sphericalDelta.phi *= (1 - this.dampingFactor);
                this._panOffset.multiplyScalar(1 - this.dampingFactor);
            } else {
                this._sphericalDelta.set(0, 0, 0);
                this._panOffset.set(0, 0, 0);
            }

            this._scale = 1;

            // update condition is:
            if (this._zoomChanged ||
                this._lastPosition.distanceToSquared(this.object.position) > _EPS ||
                8 * (1 - this._lastQuaternion.dot(this.object.quaternion)) > _EPS) {

                this.dispatchEvent(_changeEvent);

                this._lastPosition.copy(this.object.position);
                this._lastQuaternion.copy(this.object.quaternion);
                this._zoomChanged = false;

                return true;
            }

            return false;
        }

        _getAutoRotationAngle() {
            return 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
        }

        _getZoomScale() {
            return Math.pow(0.95, this.zoomSpeed);
        }

        _rotateLeft(angle) {
            this._sphericalDelta.theta -= angle;
        }

        _rotateUp(angle) {
            this._sphericalDelta.phi -= angle;
        }

        _panLeft(distance, objectMatrix) {
            const v = new THREE.Vector3();
            v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
            v.multiplyScalar(-distance);
            this._panOffset.add(v);
        }

        _panUp(distance, objectMatrix) {
            const v = new THREE.Vector3();
            if (this.screenSpacePanning === true) {
                v.setFromMatrixColumn(objectMatrix, 1);
            } else {
                v.setFromMatrixColumn(objectMatrix, 0);
                v.crossVectors(this.object.up, v);
            }
            v.multiplyScalar(distance);
            this._panOffset.add(v);
        }

        _pan(deltaX, deltaY) {
            const element = this.domElement;

            if (this.object.isPerspectiveCamera) {
                const position = this.object.position;
                const offset = new THREE.Vector3().copy(position).sub(this.target);
                let targetDistance = offset.length();

                targetDistance *= Math.tan((this.object.fov / 2) * Math.PI / 180.0);

                this._panLeft(2 * deltaX * targetDistance / element.clientHeight, this.object.matrix);
                this._panUp(2 * deltaY * targetDistance / element.clientHeight, this.object.matrix);

            } else if (this.object.isOrthographicCamera) {
                this._panLeft(deltaX * (this.object.right - this.object.left) / this.object.zoom / element.clientWidth, this.object.matrix);
                this._panUp(deltaY * (this.object.top - this.object.bottom) / this.object.zoom / element.clientHeight, this.object.matrix);
            } else {
                console.warn('WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.');
                this.enablePan = false;
            }
        }

        _dollyOut(dollyScale) {
            if (this.object.isPerspectiveCamera) {
                this._scale /= dollyScale;
            } else if (this.object.isOrthographicCamera) {
                this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom * dollyScale));
                this.object.updateProjectionMatrix();
                this._zoomChanged = true;
            } else {
                console.warn('WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.');
                this.enableZoom = false;
            }
        }

        _dollyIn(dollyScale) {
            if (this.object.isPerspectiveCamera) {
                this._scale *= dollyScale;
            } else if (this.object.isOrthographicCamera) {
                this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom / dollyScale));
                this.object.updateProjectionMatrix();
                this._zoomChanged = true;
            } else {
                console.warn('WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.');
                this.enableZoom = false;
            }
        }

        // Event handlers
        _onContextMenu = (event) => {
            if (this.enabled === false) return;
            event.preventDefault();
        }

        _onPointerDown = (event) => {
            if (this.enabled === false) return;

            this._addPointer(event);

            if (event.pointerType === 'touch') {
                this._onTouchStart(event);
            } else {
                this._onMouseDown(event);
            }
        }

        _onPointerMove = (event) => {
            if (this.enabled === false) return;

            if (event.pointerType === 'touch') {
                this._onTouchMove(event);
            } else {
                this._onMouseMove(event);
            }
        }

        _onPointerUp = (event) => {
            this._removePointer(event);

            if (this._pointers.length === 0) {
                this.domElement.releasePointerCapture(event.pointerId);
                this.domElement.removeEventListener('pointermove', this._onPointerMove);
                this.domElement.removeEventListener('pointerup', this._onPointerUp);
            }

            this.dispatchEvent(_endEvent);
            this._state = _STATE.NONE;
        }

        _onMouseDown = (event) => {
            let mouseAction;

            switch (event.button) {
                case 0:
                    mouseAction = this.mouseButtons.LEFT;
                    break;
                case 1:
                    mouseAction = this.mouseButtons.MIDDLE;
                    break;
                case 2:
                    mouseAction = this.mouseButtons.RIGHT;
                    break;
                default:
                    mouseAction = -1;
            }

            switch (mouseAction) {
                case THREE.MOUSE.DOLLY:
                    if (this.enableZoom === false) return;
                    this._handleMouseDownDolly(event);
                    this._state = _STATE.DOLLY;
                    break;

                case THREE.MOUSE.ROTATE:
                    if (event.ctrlKey || event.metaKey || event.shiftKey) {
                        if (this.enablePan === false) return;
                        this._handleMouseDownPan(event);
                        this._state = _STATE.PAN;
                    } else {
                        if (this.enableRotate === false) return;
                        this._handleMouseDownRotate(event);
                        this._state = _STATE.ROTATE;
                    }
                    break;

                case THREE.MOUSE.PAN:
                    if (event.ctrlKey || event.metaKey || event.shiftKey) {
                        if (this.enableRotate === false) return;
                        this._handleMouseDownRotate(event);
                        this._state = _STATE.ROTATE;
                    } else {
                        if (this.enablePan === false) return;
                        this._handleMouseDownPan(event);
                        this._state = _STATE.PAN;
                    }
                    break;

                default:
                    this._state = _STATE.NONE;
            }

            if (this._state !== _STATE.NONE) {
                this.domElement.setPointerCapture(event.pointerId);
                this.domElement.addEventListener('pointermove', this._onPointerMove);
                this.domElement.addEventListener('pointerup', this._onPointerUp);
                this.dispatchEvent(_startEvent);
            }
        }

        _onMouseMove = (event) => {
            switch (this._state) {
                case _STATE.ROTATE:
                    if (this.enableRotate === false) return;
                    this._handleMouseMoveRotate(event);
                    break;

                case _STATE.DOLLY:
                    if (this.enableZoom === false) return;
                    this._handleMouseMoveDolly(event);
                    break;

                case _STATE.PAN:
                    if (this.enablePan === false) return;
                    this._handleMouseMovePan(event);
                    break;
            }
        }

        _onMouseWheel = (event) => {
            if (this.enabled === false || this.enableZoom === false || this._state !== _STATE.NONE) return;

            event.preventDefault();

            this.dispatchEvent(_startEvent);

            this._handleMouseWheel(event);

            this.dispatchEvent(_endEvent);
        }

        _onTouchStart = (event) => {
            this._trackPointer(event);

            switch (this._pointers.length) {
                case 1:
                    switch (this.touches.ONE) {
                        case THREE.TOUCH.ROTATE:
                            if (this.enableRotate === false) return;
                            this._handleTouchStartRotate();
                            this._state = _STATE.TOUCH_ROTATE;
                            break;

                        case THREE.TOUCH.PAN:
                            if (this.enablePan === false) return;
                            this._handleTouchStartPan();
                            this._state = _STATE.TOUCH_PAN;
                            break;

                        default:
                            this._state = _STATE.NONE;
                    }
                    break;

                case 2:
                    switch (this.touches.TWO) {
                        case THREE.TOUCH.DOLLY_PAN:
                            if (this.enableZoom === false && this.enablePan === false) return;
                            this._handleTouchStartDollyPan();
                            this._state = _STATE.TOUCH_DOLLY_PAN;
                            break;

                        case THREE.TOUCH.DOLLY_ROTATE:
                            if (this.enableZoom === false && this.enableRotate === false) return;
                            this._handleTouchStartDollyRotate();
                            this._state = _STATE.TOUCH_DOLLY_ROTATE;
                            break;

                        default:
                            this._state = _STATE.NONE;
                    }
                    break;

                default:
                    this._state = _STATE.NONE;
            }

            if (this._state !== _STATE.NONE) {
                this.dispatchEvent(_startEvent);
            }
        }

        _onTouchMove = (event) => {
            this._trackPointer(event);

            switch (this._state) {
                case _STATE.TOUCH_ROTATE:
                    if (this.enableRotate === false) return;
                    this._handleTouchMoveRotate(event);
                    this.update();
                    break;

                case _STATE.TOUCH_PAN:
                    if (this.enablePan === false) return;
                    this._handleTouchMovePan(event);
                    this.update();
                    break;

                case _STATE.TOUCH_DOLLY_PAN:
                    if (this.enableZoom === false && this.enablePan === false) return;
                    this._handleTouchMoveDollyPan(event);
                    this.update();
                    break;

                case _STATE.TOUCH_DOLLY_ROTATE:
                    if (this.enableZoom === false && this.enableRotate === false) return;
                    this._handleTouchMoveDollyRotate(event);
                    this.update();
                    break;

                default:
                    this._state = _STATE.NONE;
            }
        }

        // Helper methods for mouse/touch handling
        _handleMouseDownRotate(event) {
            this._rotateStart.set(event.clientX, event.clientY);
        }

        _handleMouseDownDolly(event) {
            this._dollyStart.set(event.clientX, event.clientY);
        }

        _handleMouseDownPan(event) {
            this._panStart.set(event.clientX, event.clientY);
        }

        _handleMouseMoveRotate(event) {
            this._rotateEnd.set(event.clientX, event.clientY);
            this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart).multiplyScalar(this.rotateSpeed);

            const element = this.domElement;

            this._rotateLeft(2 * Math.PI * this._rotateDelta.x / element.clientHeight);
            this._rotateUp(2 * Math.PI * this._rotateDelta.y / element.clientHeight);

            this._rotateStart.copy(this._rotateEnd);
            this.update();
        }

        _handleMouseMoveDolly(event) {
            this._dollyEnd.set(event.clientX, event.clientY);
            this._dollyDelta.subVectors(this._dollyEnd, this._dollyStart);

            if (this._dollyDelta.y > 0) {
                this._dollyOut(this._getZoomScale());
            } else if (this._dollyDelta.y < 0) {
                this._dollyIn(this._getZoomScale());
            }

            this._dollyStart.copy(this._dollyEnd);
            this.update();
        }

        _handleMouseMovePan(event) {
            this._panEnd.set(event.clientX, event.clientY);
            this._panDelta.subVectors(this._panEnd, this._panStart).multiplyScalar(this.panSpeed);

            this._pan(this._panDelta.x, this._panDelta.y);

            this._panStart.copy(this._panEnd);
            this.update();
        }

        _handleMouseWheel(event) {
            if (event.deltaY < 0) {
                this._dollyIn(this._getZoomScale());
            } else if (event.deltaY > 0) {
                this._dollyOut(this._getZoomScale());
            }

            this.update();
        }

        _handleTouchStartRotate() {
            if (this._pointers.length === 1) {
                this._rotateStart.set(this._pointers[0].pageX, this._pointers[0].pageY);
            } else {
                const x = 0.5 * (this._pointers[0].pageX + this._pointers[1].pageX);
                const y = 0.5 * (this._pointers[0].pageY + this._pointers[1].pageY);
                this._rotateStart.set(x, y);
            }
        }

        _handleTouchStartPan() {
            if (this._pointers.length === 1) {
                this._panStart.set(this._pointers[0].pageX, this._pointers[0].pageY);
            } else {
                const x = 0.5 * (this._pointers[0].pageX + this._pointers[1].pageX);
                const y = 0.5 * (this._pointers[0].pageY + this._pointers[1].pageY);
                this._panStart.set(x, y);
            }
        }

        _handleTouchStartDolly() {
            const dx = this._pointers[0].pageX - this._pointers[1].pageX;
            const dy = this._pointers[0].pageY - this._pointers[1].pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            this._dollyStart.set(0, distance);
        }

        _handleTouchStartDollyPan() {
            if (this.enableZoom) this._handleTouchStartDolly();
            if (this.enablePan) this._handleTouchStartPan();
        }

        _handleTouchStartDollyRotate() {
            if (this.enableZoom) this._handleTouchStartDolly();
            if (this.enableRotate) this._handleTouchStartRotate();
        }

        _handleTouchMoveRotate(event) {
            if (this._pointers.length == 1) {
                this._rotateEnd.set(event.pageX, event.pageY);
            } else {
                const position = this._getSecondPointerPosition(event);
                const x = 0.5 * (event.pageX + position.x);
                const y = 0.5 * (event.pageY + position.y);
                this._rotateEnd.set(x, y);
            }

            this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart).multiplyScalar(this.rotateSpeed);

            const element = this.domElement;

            this._rotateLeft(2 * Math.PI * this._rotateDelta.x / element.clientHeight);
            this._rotateUp(2 * Math.PI * this._rotateDelta.y / element.clientHeight);

            this._rotateStart.copy(this._rotateEnd);
        }

        _handleTouchMovePan(event) {
            if (this._pointers.length === 1) {
                this._panEnd.set(event.pageX, event.pageY);
            } else {
                const position = this._getSecondPointerPosition(event);
                const x = 0.5 * (event.pageX + position.x);
                const y = 0.5 * (event.pageY + position.y);
                this._panEnd.set(x, y);
            }

            this._panDelta.subVectors(this._panEnd, this._panStart).multiplyScalar(this.panSpeed);

            this._pan(this._panDelta.x, this._panDelta.y);

            this._panStart.copy(this._panEnd);
        }

        _handleTouchMoveDolly(event) {
            const position = this._getSecondPointerPosition(event);
            const dx = event.pageX - position.x;
            const dy = event.pageY - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            this._dollyEnd.set(0, distance);
            this._dollyDelta.set(0, Math.pow(this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed));

            this._dollyOut(this._dollyDelta.y);

            this._dollyStart.copy(this._dollyEnd);
        }

        _handleTouchMoveDollyPan(event) {
            if (this.enableZoom) this._handleTouchMoveDolly(event);
            if (this.enablePan) this._handleTouchMovePan(event);
        }

        _handleTouchMoveDollyRotate(event) {
            if (this.enableZoom) this._handleTouchMoveDolly(event);
            if (this.enableRotate) this._handleTouchMoveRotate(event);
        }

        _addPointer(event) {
            this._pointers.push(event);
        }

        _removePointer(event) {
            delete this._pointerPositions[event.pointerId];

            for (let i = 0; i < this._pointers.length; i++) {
                if (this._pointers[i].pointerId == event.pointerId) {
                    this._pointers.splice(i, 1);
                    return;
                }
            }
        }

        _trackPointer(event) {
            let position = this._pointerPositions[event.pointerId];

            if (position === undefined) {
                position = new THREE.Vector2();
                this._pointerPositions[event.pointerId] = position;
            }

            position.set(event.pageX, event.pageY);
        }

        _getSecondPointerPosition(event) {
            const pointer = (event.pointerId === this._pointers[0].pointerId) ? this._pointers[1] : this._pointers[0];
            return this._pointerPositions[pointer.pointerId];
        }
    }

    // 将OrbitControls添加到THREE命名空间
    THREE.OrbitControls = OrbitControls;

})();