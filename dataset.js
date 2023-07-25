// path to folder with converted dataset files outputted by convert.py
export const path_prefix = "dataset/tng50-4-0/layered";

// the size per block
export let block_size = 128.0;

// number of blocks the dataset is split into in each dimension, match with convert.py
export let block_count_x = 8;
export let block_count_y = 8;
export let block_count_z = 8;

// export const path_prefix = "dataset/tng50-3-0/layered";
// export let block_size = 64.0;
// export let block_count_x = 6;
// export let block_count_y = 16;
// export let block_count_z = 16;

// IMPORTS
import * as THREE from 'three';
import * as HDF5 from 'jsfive';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { Vector3 } from 'three';
import { PointOctree } from 'sparse-octree';

// SHADERS
import raycast_vert from './shaders/raycast.vert?raw';
import raycast_frag from './shaders/raycast.frag?raw';

import splat_vert from './shaders/splat.vert?raw';
import splat_frag from './shaders/splat.frag?raw';

export const path_suffix = ".bin";

function boxInFrustum(box, camera) {
	box = box.applyMatrix4(camera.matrixWorldInverse);
	return frustum.intersectsBox(box);
}

var box = new THREE.Box3();
var frustum = new THREE.Frustum();
var pos_x = new Float32Array([-0.5,0.5,-0.5,0.5,-0.5,0.5,-0.5,0.5]);
var pos_y = new Float32Array([-0.5,-0.5,0.5,0.5,-0.5,-0.5,0.5,0.5]);
var pos_z = new Float32Array([-0.5,-0.5,-0.5,-0.5,0.5,0.5,0.5,0.5]);
var order_x = new Float32Array([0,1,0,1,0,1,0,1]);
var order_y = new Float32Array([0,0,1,1,0,0,1,1]);
var order_z = new Float32Array([0,0,0,0,1,1,1,1]);
var order = new Uint32Array([0,1,2,3,4,5,6,7]);
var dir = new Vector3();

export var frame_data = {
	target_fps: 30,
	refine_error : 1,
	coarsen_error : 1e100,
	error_threshold : 1e100,
	index_threshold : 8192,
	last_index_count : 0,
	threshold_min: 0.0,
	threshold_max: 4e-9,
	alpha_exponent: 6.0,
	alpha_cutoff: 0.05347,
	size_factor: 90.0,
	distance_power: 2,
	outline_strength: 1.0,
	global_sort: 0,
}

export function resetErrors() {
	frame_data.refine_error = 0.0;
	frame_data.coarsen_error = 1e100;
	frame_data.last_index_count = 0;
}

function levelSort(view_dir) {
	return function(lhs_index, rhs_index) {
		const lhs_dot = pos_x[lhs_index] * view_dir.x + pos_y[lhs_index] * view_dir.y + pos_z[lhs_index] * view_dir.z
	 	const rhs_dot = pos_x[rhs_index] * view_dir.x + pos_y[rhs_index] * view_dir.y + pos_z[rhs_index] * view_dir.z;
		return lhs_dot <= rhs_dot;
	}
}

function globalSort(cube, view_dir) {
	return function(lhs_index, rhs_index) {
		const lhs = new Vector3(
			cube.geometry.getAttribute('position').array[3 * lhs_index],
			cube.geometry.getAttribute('position').array[3 * lhs_index + 1],
			cube.geometry.getAttribute('position').array[3 * lhs_index + 2]);
		const rhs = new Vector3(
			cube.geometry.getAttribute('position').array[3 * rhs_index],
			cube.geometry.getAttribute('position').array[3 * rhs_index + 1],
			cube.geometry.getAttribute('position').array[3 * rhs_index + 2]);
		return lhs.dot(view_dir) <= rhs.dot(view_dir);
	};
}
var index = 0; // current index into indices array
function generateIndicesRecursive(positions, octree, level, cell, indices, camera, view_dir) {
	const sidelength = octree.level_sidelengths[level];
	// NOTE: numpy generates grid in z-x-y order for some reason
	const octree_index = octree.level_offsets[level] + cell.z + cell.x * sidelength + cell.y * sidelength * sidelength;
	if (level <= 3) {
		const factor = 0.5 * block_size / sidelength;
		box.min.x = octree.position.x + positions[3 * octree_index] - factor;
		box.min.y = octree.position.y + positions[3 * octree_index+1] - factor;
		box.min.z = octree.position.z + positions[3 * octree_index+2] - factor;
		box.max.x = octree.position.x + positions[3 * octree_index] + factor;
		box.max.y = octree.position.y + positions[3 * octree_index+1] + factor;
		box.max.z = octree.position.z + positions[3 * octree_index+2] + factor;
	  if (!boxInFrustum(box, camera)) return;
	}
	
	const distance = Math.sqrt(
		Math.pow(octree.position.x + positions[3 * octree_index] - camera.position.x, 2.0) + 
		Math.pow(octree.position.y + positions[3 * octree_index + 1] - camera.position.y, 2.0) + 
		Math.pow(octree.position.z + positions[3 * octree_index + 2] - camera.position.z, 2.0));
	
	var error = octree.error[octree_index] / (Math.pow(distance, frame_data.distance_power));
	
	if (level + 1 >= octree.depth || frame_data.last_index_count >= frame_data.index_threshold) {
		// these cases should not influence refine_error and 
		// coarsen_error as they are not influenced by the actual error
		indices[index] = octree_index;
		index += 1;
		frame_data.last_index_count += 1;
	} else if (error < frame_data.error_threshold) {
		frame_data.refine_error = Math.max(frame_data.refine_error, error);
		indices[index] = octree_index;
		index += 1;
		frame_data.last_index_count += 1;
	} else {
		frame_data.coarsen_error = Math.min(frame_data.coarsen_error, (1+1e-6)*error);
		dir.x = octree.position.x + positions[3*octree_index] - camera.position.x
		dir.y = octree.position.y + positions[3*octree_index+1] - camera.position.y
		dir.z = octree.position.z + positions[3*octree_index+2] - camera.position.z
		if (frame_data.global_sort == 0) {
			order.sort(levelSort(dir));
		}
		// TODO: is there a better way to allocate stuff on the stack?
		const i0 = order[0];
		const i1 = order[1];
		const i2 = order[2];
		const i3 = order[3];
		const i4 = order[4];
		const i5 = order[5];
		const i6 = order[6];
		const i7 = order[7];
		var child_cell = { x: 2 * cell.x + order_x[i0], y: 2 * cell.y + order_y[i0], z: 2 * cell.z + order_z[i0]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i1], y: 2 * cell.y + order_y[i1], z: 2 * cell.z + order_z[i1]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i2], y: 2 * cell.y + order_y[i2], z: 2 * cell.z + order_z[i2]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i3], y: 2 * cell.y + order_y[i3], z: 2 * cell.z + order_z[i3]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i4], y: 2 * cell.y + order_y[i4], z: 2 * cell.z + order_z[i4]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i5], y: 2 * cell.y + order_y[i5], z: 2 * cell.z + order_z[i5]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i6], y: 2 * cell.y + order_y[i6], z: 2 * cell.z + order_z[i6]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
		child_cell = { x: 2 * cell.x + order_x[i7], y: 2 * cell.y + order_y[i7], z: 2 * cell.z + order_z[i7]};
		generateIndicesRecursive(positions, octree, level+1, child_cell, indices, camera, view_dir);
	}
}

export function generateIndices(cube, octree, camera) {
	var cell = { x: 0, y: 0, z: 0, };
	camera.updateProjectionMatrix();
	var view_dir = new Vector3();
	camera.getWorldDirection(view_dir);
	frustum.setFromProjectionMatrix(camera.projectionMatrix);
	index = 0;
	generateIndicesRecursive(cube.geometry.getAttribute('position').array, octree, 0, cell, cube.geometry.index.array, camera, view_dir);
	if (index == 0) {
		// don't render cube
		cube.geometry.visible = false;
	} else {
		if (frame_data.global_sort != 0) {
			cube.geometry.index.array.subarray(0, index).sort(globalSort(cube, view_dir));
		}
		cube.geometry.visible = true;
		cube.geometry.index.updateRange.offset = 0;
		cube.geometry.index.updateRange.count = index;
		cube.geometry.index.needsUpdate = true;
		cube.geometry.setDrawRange(0, index);
	}
}

function load(path) {
	return fetch(path)
		.then(function(response) {
			if (response.status == 200) {
				console.log("loaded %s", response.url.substring(response.url.lastIndexOf('/') + 1));
				return response.arrayBuffer();
			} else {
				return null;
			}
		});
}

function loadHdf(path) {
	return fetch(path)
		.then(function(response) {
			if (response.status == 200) {
				console.log("loaded %s", response.url.substring(response.url.lastIndexOf('/') + 1));
				return response.arrayBuffer();
			} else {
				return null;
			}
		})
		.then(function(buffer) {
			return new HDF5.File(buffer);
		});
}

export function createOctree(depth) {
	let octree = {};
	octree.position = {};
	octree.position.x = 0.0
	octree.position.y = 0.0
	octree.position.z = 0.0
	octree.depth = depth;
	octree.level_sidelengths = [];
	octree.loaded = false;
	octree.error_offset = 0;
	for (let i = 0; i < octree.depth; i++) {
		octree.level_sidelengths[i] = Math.pow(2, i);
		const level_size = Math.pow(octree.level_sidelengths[i], 3);
		octree.error_offset += level_size;
	}

  octree.level_offsets = [0];
  for (let i = 1; i < octree.depth; ++i) {
		octree.level_offsets[i] = octree.level_offsets[i-1] + Math.pow(octree.level_sidelengths[i-1], 3);
	}
	const error_count = octree.level_offsets[octree.depth-1];

	octree.density = new Float32Array(octree.error_offset);
	octree.error = new Float32Array(error_count);

	var octree_density_buffer = octree.density;
	var octree_size_buffer = new Float32Array(octree.density.length);
	var octree_position_buffer = new Float32Array(3 * octree.density.length);
	var max_index_count = Math.pow(Math.pow(2, octree.depth - 1), 3);
	var buffer_index = 0;
	for (let i = 0; i < octree.depth; ++i) {
		const size = Math.pow(2, octree.depth - i - 1);
		// NOTE: numpy generates grid in z-x-y order for some reason
		for (let y = 0; y < octree.level_sidelengths[i]; ++y) {
			const position_y = -0.5 + (y + 0.5) / octree.level_sidelengths[i];
			for (let x = 0; x < octree.level_sidelengths[i]; ++x) {
				const position_x = -0.5 + (x + 0.5) / octree.level_sidelengths[i];
				for (let z = 0; z < octree.level_sidelengths[i]; ++z) {
					const position_z = -0.5 + (z + 0.5) / octree.level_sidelengths[i];
					octree_size_buffer[buffer_index] = size;
					octree_position_buffer[3 * buffer_index] = block_size * position_x;
					octree_position_buffer[3 * buffer_index+1] = block_size * position_y;
					octree_position_buffer[3 * buffer_index+2] = block_size * position_z;
					buffer_index += 1;
				}
			}
		}
	}

	const octree_geometry = new THREE.BufferGeometry();
	const position_attribute = new THREE.BufferAttribute(octree_position_buffer, 3);
	position_attribute.needsUpdate = true;
	const density_attribute = new THREE.BufferAttribute(octree_density_buffer, 1);
	density_attribute.needsUpdate = false;
	const size_attribute = new THREE.BufferAttribute(octree_size_buffer, 1);
	size_attribute.needsUpdate = true;
	octree_geometry.setAttribute('position', position_attribute);
	octree_geometry.setAttribute('density', density_attribute);
	octree_geometry.setAttribute('size', size_attribute);
	const indices_buffer = new Uint32Array(max_index_count);
	const index_attribute = new THREE.BufferAttribute(indices_buffer, 1);
	index_attribute.updateRange.offset = 0;
	index_attribute.updateRange.count = 0;
	index_attribute.needsUpdate = false;
	index_attribute.setUsage(THREE.StreamDrawUsage);
	octree_geometry.setIndex(index_attribute);
	octree_geometry.setDrawRange(0, 0);
	
	const octree_material = new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3,
		uniforms: {
			camera_position: { value: new Vector3() },
			threshold_min: { value: frame_data.threshold_min },
			threshold_max: { value: frame_data.threshold_max },
			alpha_exponent: { value: frame_data.alpha_exponent },
			alpha_cutoff: { value: frame_data.alpha_cutoff },
			size_factor: { value: frame_data.size_factor },
			cell_size: { value: block_size },
		},
		vertexShader: splat_vert,
		fragmentShader: splat_frag,
		side: THREE.FrontSide,
		transparent: true,
		blending: THREE.NormalBlending,
		depthTest: false,
		depthWrite: false
	});

	let points = new THREE.Points(octree_geometry, octree_material);
	points.frustumCulled = false;

	return {
		points,
		octree
	};
}

export function loadAsOctree2(path, octree, cube, x, y, z) {
	return load(path).then(function(array) {
		const uint_array = new Uint32Array(array);
		const float_array = new Float32Array(array);
		const header_offset = 7;
		const depth = uint_array[0];
		if (depth < octree.depth) {
			console.log("LOADED OCTREE DOESN'T HAVE ENOUGH DEPTH");
			return null;
		}
		octree.min = { x: float_array[1], y: float_array[2], z: float_array[3] };
		octree.max = { x: float_array[4], y: float_array[5], z: float_array[6] };
		octree.size = { x: octree.max.x - octree.min.x, y: octree.max.y - octree.min.y, z: octree.max.z - octree.min.z };
		let error_offset = 0;
		for (let i = 0; i < depth; i++) {
			const level_size = Math.pow(Math.pow(2, i), 3);
			error_offset += level_size;
		}
	
		let density_attribute = cube.geometry.getAttribute('density');
		var octree_density_buffer = density_attribute.array;
		for (let i = 0; i < octree_density_buffer.length; ++i) {
			octree_density_buffer[i] = float_array[header_offset + i];
		}
		for (let i = 0; i < octree.error.length; ++i) {
			octree.error[i] = float_array[header_offset + octree.error_offset + i];
		}
	
		density_attribute.needsUpdate = true;
		cube.position.x = (x + 0.5) * block_size;
		cube.position.y = (y + 0.5) * block_size;
		cube.position.z = (z + 0.5) * block_size;
		octree.position.x = (x + 0.5) * block_size;
		octree.position.y = (y + 0.5) * block_size;
		octree.position.z = (z + 0.5) * block_size;
		octree.loaded = true;
	});
}

export function createTexture(depth) {
	const texture_size = Math.pow(2, depth - 1);
	const texture = new THREE.Data3DTexture(new Float32Array(Math.pow(texture_size, 3)), texture_size, texture_size, texture_size);
	texture.format = THREE.RedFormat;
	texture.type = THREE.FloatType;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.unpackAlignment = 1;
	texture.needsUpdate = false;

	const cube_size = new Vector3(block_size, block_size, block_size);
	const geometry = new THREE.BoxGeometry(block_size, block_size, block_size);
	const material = new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3,
		uniforms: {
			map: { value: texture },
			relative_position: { value: new Vector3() },
			camera_position: { value: new Vector3() },
			camera_direction: { value: new Vector3() },
			cube_size: { value: cube_size},
			threshold_min: { value: frame_data.threshold_min },
			threshold_max: { value: frame_data.threshold_max },
			alpha_exponent: { value: frame_data.alpha_exponent },
		},
		vertexShader: raycast_vert,
		fragmentShader: raycast_frag,
		side: THREE.BackSide,
		transparent: true,
		// blending: THREE.NormalBlending,
		//https://developer.nvidia.com/content/transparency-or-translucency-rendering
		blending: THREE.CustomBlending,
		blendEquation: THREE.AddEquation,
		blendDst: THREE.OneMinusSrcAlphaFactor,
		blendSrc: THREE.OneFactor,
		blendDstAlpha: THREE.OneFactor,
		blendSrcAlpha: THREE.OneFactor,
		depthTest: false,
		depthWrite: false
	});

	var mesh = new THREE.Mesh(geometry, material);
	return mesh;
}

export function loadAsTexture2(path, cube, x, y, z) {
	return load(path).then(function(result) {
		const uint_array = new Uint32Array(result);
		const float_array = new Float32Array(result);
		const header_offset = 7;
		const depth = uint_array[0];
		
		var offset = header_offset;
		for (let i = 0; i < depth - 1; i++) {
			const level_size = Math.pow(Math.pow(2, i), 3);
			offset += level_size;
		}

		let density_source = cube.material.uniforms.map.value.source;
		for (let i = 0; i < density_source.data.data.length; ++i) {
			density_source.data.data[i] = float_array[offset + i];
		}
		cube.material.uniforms.map.value.needsUpdate = true;
		
		cube.position.x = block_size * (0.5 + x);
		cube.position.y = block_size * (0.5 + y);
		cube.position.z = block_size * (0.5 + z);
	});
}

