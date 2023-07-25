// const mode = "raycast";
const mode = "splatting";

// IMPORTS
import { Octree, KeyDesign } from 'linear-octree';
import * as THREE from 'three';
import { Vector3 } from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';

import * as dataset from './dataset.js';

var view_pos = new THREE.Vector3();
var view_dir = new THREE.Vector3();

// 3D texture needs WebGL2
if (mode == "raycast" && WebGL.isWebGL2Available() === false) {
	document.body.appendChild(WebGL.getWebGL2ErrorMessage());
}

var stats = new Stats();
var mouse_down = false;
document.body.appendChild(stats.dom);

const renderer = new THREE.WebGLRenderer({
	powerPreference: "high-performance",
	stencil: false,
	depth: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.useLegacyLights = false;
document.body.appendChild(renderer.domElement);


const scene = new THREE.Scene();
const clock = new THREE.Clock();

function filename(x, y, z) {
	return dataset.path_prefix + ("00" + x).slice(-2) + ("00" + y).slice(-2) + ("00" + z).slice(-2) + dataset.path_suffix;
}

let cubes = []
let octrees = [];
var freeze = false;
var need_update = false;

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 10.0, 10000.0);
camera.position.z = -0.5 * 128;
camera.position.y = 1.5 * 128;
camera.position.x = 1.5 * 128;

camera.rotation.order = 'YXZ';
camera.rotation.y = Math.PI;


var last_x = Math.min(Math.max(Math.floor(camera.position.x / dataset.block_size), 1), dataset.block_count_x - 2);
var last_y = Math.min(Math.max(Math.floor(camera.position.y / dataset.block_size), 1), dataset.block_count_y - 2);
var last_z = Math.min(Math.max(Math.floor(camera.position.z / dataset.block_size), 1), dataset.block_count_z - 2);
var current_x = last_x;
var current_y = last_y;
var current_z = last_z;

let loaded_count = 0;
var loading = 0;

const outline_box = new THREE.BoxGeometry(dataset.block_count_x * dataset.block_size, dataset.block_count_y * dataset.block_size, dataset.block_count_z * dataset.block_size);
const outline_mesh = new THREE.EdgesGeometry(outline_box);
const outline_mat = new THREE.LineBasicMaterial({color: 0xFF0000});
const wireframe = new THREE.LineSegments(outline_mesh, outline_mat);
wireframe.position.x = (0.5 * dataset.block_count_x) * dataset.block_size;
wireframe.position.y = (0.5 * dataset.block_count_y) * dataset.block_size;
wireframe.position.z = (0.5 * dataset.block_count_z) * dataset.block_size;
scene.add(wireframe);

if (mode == "raycast") {
	function update() {
		for (let i = 0; i < loaded_count; ++i) {
			cubes[i].material.uniforms.threshold_min.value = dataset.frame_data.threshold_min;
			cubes[i].material.uniforms.threshold_max.value = dataset.frame_data.threshold_max;
			cubes[i].material.uniforms.alpha_exponent.value = dataset.frame_data.alpha_exponent;
			freeze = false;
		}
		outline_mat.color.r = dataset.frame_data.outline_strength;
	}
	var gui = new GUI();
	gui.add(dataset.frame_data, 'outline_strength', 0.0, 1.0, 0.1).onChange(update);
	gui.add(dataset.frame_data, 'threshold_min', 0.0, 1e-8, 1e-11).onChange(update);
	gui.add(dataset.frame_data, 'threshold_max', 0.0, 1e-8, 1e-11).onChange(update);
	gui.add(dataset.frame_data, 'alpha_exponent', 0.1, 10.0, 0.1).onChange(update);

	
	for (let z = -1; z < 2; z += 1) {
		for (let y = -1; y < 2; y += 1) {
			for (let x = -1; x < 2; x += 1) {
				const result = dataset.createTexture(8);
				const index = (z + 1) * 9 + (y + 1) * 3 + x + 1;
				cubes[index] = result;
				loading += 1;
				dataset.loadAsTexture2(filename(x + last_x, y + last_y, z + last_z), cubes[index], x + last_x, y + last_y, z + last_z).then(function() {
					scene.add(cubes[index]);
					loaded_count += 1;
					freeze = false;
					need_update = true;
					loading -= 1;
				});
			}
		}
	}
} else if (mode == "splatting") {
	function update() {
		for (let i = 0; i < loaded_count; ++i) {
			cubes[i].material.uniforms.threshold_min.value = dataset.frame_data.threshold_min;
			cubes[i].material.uniforms.threshold_max.value = dataset.frame_data.threshold_max;
			cubes[i].material.uniforms.alpha_exponent.value = dataset.frame_data.alpha_exponent;
			cubes[i].material.uniforms.alpha_cutoff.value = dataset.frame_data.alpha_cutoff;
			cubes[i].material.uniforms.size_factor.value = dataset.frame_data.size_factor;
		}
		outline_mat.color.r = dataset.frame_data.outline_strength;
		freeze = false;
		need_update = true;
	}

	var gui = new GUI();
	gui.add(dataset.frame_data, 'last_index_count').listen();
	gui.add(dataset.frame_data, 'index_threshold').listen();
	gui.add(dataset.frame_data, 'target_fps', 10, 50, 1).onChange(update);
	gui.add(dataset.frame_data, 'outline_strength', 0.0, 1.0, 0.1).onChange(update);
	gui.add(dataset.frame_data, 'threshold_min', 0.0, 1e-8, 1e-11).onChange(update);
	gui.add(dataset.frame_data, 'threshold_max', 0.0, 1e-8, 1e-11).onChange(update);
	gui.add(dataset.frame_data, 'alpha_exponent', 0.1, 10.0, 0.1).onChange(update);
	gui.add(dataset.frame_data, 'alpha_cutoff', 0.0, 1.0, 1e-5).onChange(update);
	gui.add(dataset.frame_data, 'size_factor', 1.0, 200.0, 1.0).onChange(update);
	gui.add(dataset.frame_data, 'distance_power', 0, 10, 1).onChange(update);
	gui.add(dataset.frame_data, 'global_sort', 0, 1, 1).onChange(update);

	for (let z = -1; z < 2; z += 1) {
		for (let y = -1; y < 2; y += 1) {
			for (let x = -1; x < 2; x += 1) {
				const result = dataset.createOctree(8);
				const index = (z + 1) * 9 + (y + 1) * 3 + x + 1;
				cubes[index] = result.points;
				octrees[index] = result.octree;
				loading += 1;
				dataset.loadAsOctree2(filename(x + last_x, y + last_y, z + last_z), octrees[index], cubes[index], x + last_x, y + last_y, z + last_z).then(function() {
					scene.add(cubes[index]);
					loaded_count += 1;
					freeze = false;
					need_update = true;
					loading -= 1;
				});
			}
		}
	}
}

var target_delta = 0.0333;


addEventListener("resize", (event) => {
	console.log("Resize to", window.innerWidth, "x", window.innerHeight);
	renderer.setSize(window.innerWidth, window.innerHeight);
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	freeze = false;
	need_update = true;
});

var mouse_down = false;
var forward = 0;
var right = 0;
var up = 0;
var dmouse_x = 0;
var dmouse_y = 0;
document.addEventListener('keyup', (event) => {
	switch (event.code) {
		case "KeyW": 
			forward = 0;
			break;
		case "KeyA": 
			right = 0;
			break;
		case "KeyS": 
			forward = 0;
			break;
		case "KeyD": 
			right = 0;
			break;
		case "Space": 
			up = 0;
			break;
		case "ShiftLeft": 
			up = 0;
			break;
		default:
			break;
	}
});
document.addEventListener('keydown', (event) => {
	switch (event.code) {
		case "KeyW": 
			forward = 1;
			break;
		case "KeyA": 
			right = -1;
			break;
		case "KeyS": 
			forward = -1;
			break;
		case "KeyD": 
			right = 1;
			break;
		case "Space": 
			up = 1;
			break;
		case "ShiftLeft": 
			up = -1;
			break;
		default:
			break;
	}
});
document.addEventListener('mouseup', (event) => {
	// TODO: Why is this different in mousedown????
	if (event.buttons == 0) mouse_down = false;
});
document.addEventListener('mousedown', (event) => {
	if (event.buttons == 1) mouse_down = true;
});
document.addEventListener('mousemove', (event) => {
	if (mouse_down) {
		dmouse_x += event.movementX;
		dmouse_y += event.movementY;
	}
});

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

const frametime_count = 6;
let frametime_index = 0;
let frametimes = new Float32Array(frametime_count);
for (let i = 0; i < frametime_count; ++i) {
	frametimes[i] = 0.0;
}

function animate() {
	const single_delta = clock.getDelta();
	if (!freeze) {
		frametimes[frametime_index] = single_delta;
		frametime_index = (frametime_index + 1) % frametime_count;
	}
	const delta = frametimes.reduce(function (lhs, rhs) { return lhs + rhs; }) / frametime_count;
	target_delta = 1.0 / dataset.frame_data.target_fps;
	const diff = target_delta - delta;
	
	if (dmouse_x != 0 || dmouse_y != 0 || right != 0 || up != 0 || forward != 0) {
		need_update = true;
		freeze = false;
	} else if (mode == "splatting") {
		if (dataset.frame_data.last_index_count > 
			  dataset.frame_data.index_threshold ||
				(!freeze && Math.abs(diff) > 0.001)) {
			need_update = true;
		} else if (!need_update) {
			freeze = true;
		}
	} else if (!need_update) {
		freeze = true;
	}
	requestAnimationFrame(animate);
		
	camera.rotation.x = clamp(camera.rotation.x - dmouse_y * 0.1 * single_delta, -0.5 * Math.PI, 0.5 * Math.PI);
	camera.rotation.y -= dmouse_x * 0.1 * single_delta;
	if (camera.rotation.y >= 2.0 * Math.PI) camera.rotation.y -= 2.0 * Math.PI;
	else if (camera.rotation.y <= -2.0 * Math.PI) camera.rotation.y += 2.0 * Math.PI;

	dmouse_x = 0;
	dmouse_y = 0;
	var x = new Vector3(1,0,0).applyEuler(camera.rotation);
	var y = new Vector3(0,1,0).applyEuler(camera.rotation);
	var z = new Vector3(0,0,-1).applyEuler(camera.rotation);
	camera.position
		.addScaledVector(x, 100.0 * right * single_delta)
		.addScaledVector(y, 100.0 * up * single_delta)
		.addScaledVector(z, 100.0 * forward * single_delta);

	camera.getWorldPosition(view_pos);
	camera.getWorldDirection(view_dir);

	current_x = Math.min(Math.max(Math.floor(camera.position.x / dataset.block_size), 1), dataset.block_count_x - 2);
	current_y = Math.min(Math.max(Math.floor(camera.position.y / dataset.block_size), 1), dataset.block_count_y - 2);
	current_z = Math.min(Math.max(Math.floor(camera.position.z / dataset.block_size), 1), dataset.block_count_z - 2);

	if (loading == 0) {
		if (current_x > last_x) {
			last_x += 1;
			for (let z = -1; z <= 1; z += 1) {
				for (let y = -1; y <= 1; y += 1) {
					const index = (1 + z) * 9 + (1 + y) * 3;
					
					const tmp_cube = cubes[index];
					cubes[index] = cubes[index + 1];
					cubes[index + 1] = cubes[index + 2];
					cubes[index + 2] = tmp_cube;
					
					const tmp_octree = octrees[index];
					octrees[index] = octrees[index + 1];
					octrees[index + 1] = octrees[index + 2];
					octrees[index + 2] = tmp_octree;

					loading += 1;
					const ix = last_x + 1;
					const iy = last_y + y;
					const iz = last_z + z;
					if (mode == "splatting") {
						dataset.loadAsOctree2(filename(ix, iy, iz), octrees[index + 2], cubes[index + 2], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					} else {
						dataset.loadAsTexture2(filename(ix, iy, iz), cubes[index + 2], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					}
				}
			}
		} else if (current_x < last_x) {
			last_x -= 1;
			for (let z = -1; z <= 1; z += 1) {
				for (let y = -1; y <= 1; y += 1) {
					const index = (1 + z) * 9 + (1 + y) * 3;
					
					const tmp_cube = cubes[index + 2];
					cubes[index + 2] = cubes[index + 1];
					cubes[index + 1] = cubes[index];
					cubes[index] = tmp_cube;
					
					const tmp_octree = octrees[index + 2];
					octrees[index + 2] = octrees[index + 1];
					octrees[index + 1] = octrees[index];
					octrees[index] = tmp_octree;

					loading += 1;
					const ix = last_x - 1;
					const iy = last_y + y;
					const iz = last_z + z;
					if (mode == "splatting") {
						dataset.loadAsOctree2(filename(ix, iy, iz), octrees[index], cubes[index], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					} else {
						dataset.loadAsTexture2(filename(ix, iy, iz), cubes[index], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					}
				}
			}
		} else if (current_y > last_y) {
			last_y += 1;
			for (let z = -1; z <= 1; z += 1) {
				for (let x = -1; x <= 1; x += 1) {
					const index = (1 + z) * 9 + 1 + x;
					
					const tmp_cube = cubes[index];
					cubes[index] = cubes[index + 1 * 3];
					cubes[index + 1 * 3] = cubes[index + 2 * 3];
					cubes[index + 2 * 3] = tmp_cube;
					
					const tmp_octree = octrees[index];
					octrees[index] = octrees[index + 1 * 3];
					octrees[index + 1 * 3] = octrees[index + 2 * 3];
					octrees[index + 2 * 3] = tmp_octree;

					loading += 1;
					const ix = last_x + x;
					const iy = last_y + 1;
					const iz = last_z + z;
					if (mode == "splatting") {
						dataset.loadAsOctree2(filename(ix, iy, iz), octrees[index + 2 * 3], cubes[index + 2 * 3], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					} else {
						dataset.loadAsTexture2(filename(ix, iy, iz), cubes[index + 2 * 3], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					}
				}
			}
		} else if (current_y < last_y) {
			last_y -= 1;
			for (let z = -1; z <= 1; z += 1) {
				for (let x = -1; x <= 1; x += 1) {
					const index = (1 + z) * 9 + 1 + x;
					
					const tmp_cube = cubes[index + 2 * 3];
					cubes[index + 2 * 3] = cubes[index + 1 * 3];
					cubes[index + 1 * 3] = cubes[index];
					cubes[index] = tmp_cube;
					
					const tmp_octree = octrees[index + 2 * 3];
					octrees[index + 2 * 3] = octrees[index + 1 * 3];
					octrees[index + 1 * 3] = octrees[index];
					octrees[index] = tmp_octree;

					loading += 1;
					const ix = last_x + x;
					const iy = last_y - 1;
					const iz = last_z + z;
					if (mode == "splatting") {
						dataset.loadAsOctree2(filename(ix, iy, iz), octrees[index], cubes[index], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					} else {
						dataset.loadAsTexture2(filename(ix, iy, iz), cubes[index], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					}
				}
			}
		} else if (current_z > last_z) {
			last_z += 1;
			for (let y = -1; y <= 1; y += 1) {
				for (let x = -1; x <= 1; x += 1) {
					const index = (1 + y) * 3 + 1 + x;
					
					const tmp_cube = cubes[index];
					cubes[index] = cubes[index + 1 * 9];
					cubes[index + 1 * 9] = cubes[index + 2 * 9];
					cubes[index + 2 * 9] = tmp_cube;
					
					const tmp_octree = octrees[index];
					octrees[index] = octrees[index + 1 * 9];
					octrees[index + 1 * 9] = octrees[index + 2 * 9];
					octrees[index + 2 * 9] = tmp_octree;

					loading += 1;
					const ix = last_x + x;
					const iy = last_y + y;
					const iz = last_z + 1;
					if (mode == "splatting") {
						dataset.loadAsOctree2(filename(ix, iy, iz), octrees[index + 2 * 9], cubes[index + 2 * 9], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					} else {
						dataset.loadAsTexture2(filename(ix, iy, iz), cubes[index + 2 * 9], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					}
				}
			}
		} else if (current_z < last_z) {
			last_z -= 1;
			for (let y = -1; y <= 1; y += 1) {
				for (let x = -1; x <= 1; x += 1) {
					const index = (1 + y) * 3 + 1 + x;
					
					const tmp_cube = cubes[index + 2 * 9];
					cubes[index + 2 * 9] = cubes[index + 1 * 9];
					cubes[index + 1 * 9] = cubes[index];
					cubes[index] = tmp_cube;
					
					const tmp_octree = octrees[index + 2 * 9];
					octrees[index + 2 * 9] = octrees[index + 1 * 9];
					octrees[index + 1 * 9] = octrees[index];
					octrees[index] = tmp_octree;

					loading += 1;
					const ix = last_x + x;
					const iy = last_y + y;
					const iz = last_z - 1;
					if (mode == "splatting") {
						dataset.loadAsOctree2(filename(ix, iy, iz), octrees[index], cubes[index], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					} else {
						dataset.loadAsTexture2(filename(ix, iy, iz), cubes[index], ix, iy, iz).then(function() {
							freeze = false;
							need_update = true;
							loading -= 1;
						});
					}
				}
			}
		}
	}

	if (loaded_count > 0 && !freeze) {
		for (let i = 0; i < 27; ++i) {
			if (mode == "splatting") {
				cubes[i].material.uniforms.camera_position.value.copy(view_pos);
			} else {
				cubes[i].material.uniforms.relative_position.value.x = cubes[i].position.x - camera.position.x;
				cubes[i].material.uniforms.relative_position.value.y = cubes[i].position.y - camera.position.y;
				cubes[i].material.uniforms.relative_position.value.z = cubes[i].position.z - camera.position.z;
				cubes[i].material.uniforms.camera_position.value.copy(view_pos);
				cubes[i].material.uniforms.camera_direction.value.copy(view_dir);
			}
		}
		
		if (mode == "splatting") {
			if (delta > 1.0) {
				dataset.frame_data.error_threshold = 1e100;
				dataset.frame_data.index_threshold = 8192;
			} else if (need_update) {
				if (dataset.frame_data.last_index_count >= dataset.frame_data.index_threshold) {
					if (diff >= 0) {
						// refine
						dataset.frame_data.index_threshold += 8192;
					} else {
						// coarsen
						dataset.frame_data.error_threshold = Math.max(Math.max(1.0 - diff, 1.5) * dataset.frame_data.error_threshold, dataset.frame_data.coarsen_error);
					}
				} else {
					if (diff >= 0) {
						// refine
						dataset.frame_data.error_threshold = Math.min(Math.max(1.0 - diff, 0.5) * dataset.frame_data.error_threshold, dataset.frame_data.refine_error);
					} else {
						// coarsen
						dataset.frame_data.error_threshold = Math.max((1.0 - diff) * dataset.frame_data.error_threshold, dataset.frame_data.coarsen_error);
						if (dataset.frame_data.index_threshold >= 12288 + dataset.frame_data.last_index_count) {
							dataset.frame_data.index_threshold -= 8192;
						}
					}
					
				}
			}
			if (need_update) {
				need_update = false;
				dataset.resetErrors();
			
				for (let i = 0; i < loaded_count; ++i) {
					if (octrees[i].loaded) {
						dataset.generateIndices(cubes[i], octrees[i], camera, 0.0);
					}
				}
			}
		} else {
			need_update = false;
		}
		
		// NOTE: default sort is based on view direction, this can produce incorrect results when close to the intersection of two cubes
		for (let i = 0; i < 27; ++i) {
			cubes[i].renderOrder = -(
				Math.pow(cubes[i].position.x - camera.position.x, 2) +
				Math.pow(cubes[i].position.y - camera.position.y, 2) +
				Math.pow(cubes[i].position.z - camera.position.z, 2));
		}
	}

	if (!freeze) {
		renderer.render(scene, camera);
	}
	stats.update();
}

animate();
