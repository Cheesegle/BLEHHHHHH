import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.121.1/build/three.module.js";
import {
    GLTFLoader
} from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/loaders/GLTFLoader.js";
import {
    PointerLockControls
} from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/PointerLockControls.js";
import {
    RGBELoader
} from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/loaders/RGBELoader.js";
import {
    threeToCannon,
    ShapeType
} from 'https://cdn.jsdelivr.net/npm/three-to-cannon@4.3.0/+esm'

var scene, camera, renderer;
var pointerControls;
var moveForward = false;
var moveBackward = false;
var moveLeft = false;
var moveRight = false;
var moveUp = false;
var moveDown = false;
var physicsWorld;
var cameraBody;
var hudCanvas, hudContext;


const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

function init() {

    initHUD();

    scene = new THREE.Scene();

    // Create Cannon.js physics world
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, -20, 0); // Set gravity (adjust as needed)

    // Add linear and angular damping to the world
    physicsWorld.defaultContactMaterial.friction = 0.8; // Adjust the friction value as needed
    physicsWorld.defaultContactMaterial.restitution = 0; // Adjust the restitution value as needed
    physicsWorld.defaultContactMaterial.contactEquationStiffness = 1e9; // Adjust as needed
    physicsWorld.defaultContactMaterial.contactEquationRelaxation = 4; // Adjust as needed
    physicsWorld.defaultContactMaterial.frictionEquationStiffness = 1e9; // Adjust as needed
    physicsWorld.defaultContactMaterial.frictionEquationRelaxation = 4; // Adjust as needed

    var textureLoader = new THREE.TextureLoader();

    // Load the HDR environment map
    new RGBELoader()
        .setDataType(THREE.UnsignedByteType)
        .load('sky.hdr', function(hdrTexture) {
            hdrTexture.mapping = THREE.EquirectangularReflectionMapping;

            // Create an ambient light with the HDR environment map
            var ambientLight = new THREE.AmbientLight(0xffffff, 3); // Reduce the intensity as needed
            scene.add(ambientLight);

            // Apply the HDR environment map to materials
            scene.background = hdrTexture;
            scene.environment = hdrTexture;

            camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 20000);

            // Create a Cannon.js body for the camera
            var cameraShape = new CANNON.Sphere(6);
            cameraBody = new CANNON.Body({
                mass: 1,
                position: new CANNON.Vec3(0, 20, 0)
            });
            cameraBody.addShape(cameraShape);
            physicsWorld.addBody(cameraBody);

            renderer = new THREE.WebGLRenderer({
                canvas: document.getElementById("renderCanvas"),
                antialias: true
            });
            renderer.setSize(window.innerWidth, window.innerHeight);

            // Add PointerLockControls for keyboard control
            pointerControls = new PointerLockControls(camera, document.body);
            scene.add(pointerControls.getObject());

            var loader = new GLTFLoader();
            loader.load('map.glb', function(gltf) {
                var model = gltf.scene;

                model.traverse(function(child) {
                    if (child.isMesh) {
                        let cannonBody = new CANNON.Body({
                            mass: 0,
                            position: new CANNON.Vec3(child.position.x, child.position.y, child.position.z),
                            quaternion: new CANNON.Quaternion().copy(child.quaternion) // Set the quaternion to match the child's rotation
                        });

                        let converted = threeToCannon(child, {
                            type: ShapeType.BOX
                        });

                        // Visualize the box hitbox
                        const debugMesh = new THREE.Mesh(
                            new THREE.BoxGeometry(converted.shape.halfExtents.x * 2, converted.shape.halfExtents.y * 2, converted.shape.halfExtents.z * 2),
                            new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
                        );
                        debugMesh.position.copy(child.position);
                        debugMesh.quaternion.copy(child.quaternion); // Set the debug mesh rotation to match the child's rotation
                        scene.add(debugMesh);
                        cannonBody.addShape(converted.shape, converted.offset, converted.orientation);
                        physicsWorld.addBody(cannonBody);

                        child.material.envMapIntensity = 0.5; // Adjust this value to control reflection intensity
                    }
                });

                scene.add(model);

                animate();
            });

            // Event listener for mouse lock
            document.addEventListener('click', function() {
                pointerControls.lock();
            });

            // Event listener for when the pointer lock is lost
            pointerControls.addEventListener('lock', function() {
                document.body.style.cursor = 'none';
            });

            pointerControls.addEventListener('unlock', function() {
                document.body.style.cursor = 'auto';
            });

            var keyState = {};
            window.addEventListener('keydown', function(e) {
                keyState[e.keyCode || e.which] = true;
            }, true);
            window.addEventListener('keyup', function(e) {
                keyState[e.keyCode || e.which] = false;
            }, true);

            cameraBody.addEventListener("collide", handleCollision);

            var playerSpeed = 1; // Adjust the player movement speed as needed

            function handleCollision(event) {
                // Get the contact normal (the direction of the collision)
                var contactNormal = event.contact.ni;

                // Get the current velocity of the player body
                var velocity = cameraBody.velocity;

                // Calculate the dot product of the velocity and the contact normal
                var dot = velocity.dot(contactNormal);

                // If the dot product is less than zero, it means the player is moving into the collision
                // In that case, cancel out the velocity component in the direction of the collision
                if (dot < 0) {
                    var cancelVelocity = contactNormal.scale(dot);
                    velocity.vsub(cancelVelocity, velocity);
                }
            }

            let time = performance.now();

            function animate() {

                let frameTime = clamp((performance.now() - time), 1, 32)

                time = performance.now();

                requestAnimationFrame(animate);

                physicsWorld.step(frameTime / 1000);

                // Get the camera's direction
                var direction = pointerControls.getDirection(new THREE.Vector3(0, 0, 0)).clone();

                // Normalize the direction vector to ensure consistent movement speed
                direction.normalize();

                var position = cameraBody.position;
                var velocity = cameraBody.velocity;

                // Apply damping to the velocity to slow down the player's movement
                var dampingFactor = 0.98; // Adjust the damping factor as needed
                velocity.x *= dampingFactor;
                velocity.z *= dampingFactor;

                // Update player's position based on camera direction and keyboard input
                if (keyState[87]) {
                    velocity.x += direction.x * playerSpeed;
                    velocity.z += direction.z * playerSpeed;
                }
                if (keyState[83]) {
                    velocity.x -= direction.x * playerSpeed;
                    velocity.z -= direction.z * playerSpeed;
                }
                if (keyState[65]) {
                    var leftDirection = new THREE.Vector3();
                    leftDirection.crossVectors(direction, new THREE.Vector3(0, 1, 0));
                    leftDirection.normalize();
                    velocity.x -= leftDirection.x * playerSpeed;
                    velocity.z -= leftDirection.z * playerSpeed;
                }
                if (keyState[68]) {
                    var rightDirection = new THREE.Vector3();
                    rightDirection.crossVectors(direction, new THREE.Vector3(0, 1, 0));
                    rightDirection.normalize();
                    velocity.x += rightDirection.x * playerSpeed;
                    velocity.z += rightDirection.z * playerSpeed;
                }

                if (keyState[32]) {
                    if (cameraBody.world.contacts.length > 0) {
                        if (velocity.y < 15) {
                            velocity.y += 10;
                        }
                    }
                }

                // Update the camera's position
                camera.position.set(position.x, position.y, position.z);

                renderer.render(scene, camera);

                // Update HUD
                updateHUD(frameTime);

                renderer.render(scene, camera);
            }

        });
}

function initHUD() {
    hudCanvas = document.getElementById("hudCanvas");
    hudContext = hudCanvas.getContext("2d");

    // Set initial HUD canvas size
    hudCanvas.width = window.innerWidth;
    hudCanvas.height = window.innerHeight;
}

function updateHUD(frameTime) {
    // Clear the HUD canvas
    hudContext.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

    // Display FrameTime
    hudContext.fillStyle = "#00FF00";
    hudContext.font = "16px Arial";
    hudContext.fillText("FrameTime: " + frameTime, 10, 20);

    // Calculate FPS
    let fps = Math.round(1 / (frameTime / 1000));

    // Display FPS
    hudContext.fillStyle = "#00FF00";
    hudContext.font = "16px Arial";
    hudContext.fillText("FPS: " + fps, 10, 40); // Adjust position as needed

    // Draw a simple crosshair at the center
    hudContext.strokeStyle = "#00FF00";
    hudContext.lineWidth = 2;
    hudContext.beginPath();
    hudContext.moveTo(hudCanvas.width / 2 - 10, hudCanvas.height / 2);
    hudContext.lineTo(hudCanvas.width / 2 + 10, hudCanvas.height / 2);
    hudContext.moveTo(hudCanvas.width / 2, hudCanvas.height / 2 - 10);
    hudContext.lineTo(hudCanvas.width / 2, hudCanvas.height / 2 + 10);
    hudContext.stroke();
}



document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Connect to the Socket.io server

    // Add event listeners and emit events as needed
    socket.on("connect", () => {
        console.log("Connected to the server");

        // Start sending player position 60 times per second
        setInterval(() => {
            const playerPosition = {
                x: Math.trunc(cameraBody.position.x * 100) / 100,
                y: Math.trunc(cameraBody.position.y * 100) / 100,
                z: Math.trunc(cameraBody.position.z * 100) / 100,
            };
            socket.emit("updatePosition", playerPosition);
        }, 1000 / 60); // 60 times per second
    });

    socket.on("disconnect", () => {
        console.log("Disconnected from the server");
    });

    // Handle custom events from the server
    socket.on("serverMessage", (message) => {
        console.log(`Message from server: ${message}`);
    });

    // Create an object to store player models
    const playerModels = {};

    // Function to create or update player models
    function createOrUpdatePlayerModel(playerId, position) {
        if (!playerModels[playerId]) {
            // Create a new player model (a simple cube)
            const playerGeometry = new THREE.SphereGeometry(6);
            const playerMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00
            });
            playerModels[playerId] = new THREE.Mesh(playerGeometry, playerMaterial);
            scene.add(playerModels[playerId]);
        }

        // Update the player model's position
        playerModels[playerId].position.set(position.x, position.y, position.z);
    }

    // Handle incoming player position updates from the server
    socket.on('updatePlayerPosition', ({
        playerId,
        playerPosition
    }) => {
        createOrUpdatePlayerModel(playerId, playerPosition);
    });

    // Handle player disconnects
    socket.on('playerDisconnected', (disconnectedPlayerId) => {
        if (playerModels[disconnectedPlayerId]) {
            scene.remove(playerModels[disconnectedPlayerId]);
            delete playerModels[disconnectedPlayerId];
        }
    });
});

window.addEventListener('resize', function() {
    var newWidth = window.innerWidth;
    var newHeight = window.innerHeight;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);

    // Resize HUD canvas
    hudCanvas.width = newWidth;
    hudCanvas.height = newHeight;
});

init();