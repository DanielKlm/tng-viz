// IMPORTS
import * as THREE from 'three';
import * as NOISE from 'noisejs';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// SHADERS
import raytrace_vert from './shaders/raytrace.vert?raw';
import raytrace_frag from './shaders/raytrace.frag?raw';

export function texture(size) {
  var data = new Float32Array(size * size * size);
  var noise = new NOISE.Noise(Math.random());
  const factor = 10.0;
  var max_value = 0.0;
  let i = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[i] = Math.abs(noise.perlin3(factor * x / size, factor * y / size, factor * z / size));
        if (max_value < data[i]) max_value = data[i];
        i += 1;
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const parameters = {
    alpha_exponent: 1.0,
		threshold_min: 0.0,
		threshold_max: max_value,
  };
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      map: { value: texture },
      camera_position: { value: new THREE.Vector3() },
			threshold_min: { value: parameters.threshold_min },
			threshold_max: { value: parameters.threshold_max },
      alpha_exponent: { value: parameters.alpha_exponent },
    },
    vertexShader: raytrace_vert,
    fragmentShader: raytrace_frag,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false
  });

  function update() {
		material.uniforms.threshold_min.value = parameters.threshold_min;
		material.uniforms.threshold_max.value = parameters.threshold_max;
    material.uniforms.alpha_exponent.value = parameters.alpha_exponent;
  }

  var gui = new GUI();
	gui.add(parameters, 'threshold_min', 0.0, max_value, max_value * 1e-2).onChange(update);
	gui.add(parameters, 'threshold_max', 0.0, max_value, max_value * 1e-2).onChange(update);
  gui.add(parameters, 'alpha_exponent', 0.1, 10.0, 0.1).onChange(update);
  return new THREE.Mesh(geometry, material);
}
