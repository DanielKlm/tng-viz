in vec3 position;
in float density;
in float size;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 camera_position;
uniform float threshold_min;
uniform float threshold_max;
uniform float size_factor;
uniform float cell_size;
uniform float alpha_exponent;
uniform float alpha_cutoff;

out vec3 splat_color;
out float splat_density;
out float splat_size;
out float splat_alpha;

vec3 blackbody(float x) {
	const vec3 colors[5] = vec3[5](
		vec3(0.0),
		vec3(178.0/255.0, 34.0/255.0, 34.0/255.0),
		vec3(227.0/255.0, 105.0/255.0, 5.0/255.0),
		vec3(238.0/255.0, 210.0/255.0, 20.0/255.0),
		vec3(1.0)
	);
	const float thresholds[5] = float[5](
		0.0,
		0.39,
		0.58,
		0.84,
		1.0
	);
	if (x < 0.0) return vec3(0.0);

	#pragma unroll_loop_start 
	for (int i = 1; i < 5; ++i) {
		if (x < thresholds[i]) {
			float f = (x-thresholds[i-1])/(thresholds[i]-thresholds[i-1]);
			return f * colors[i] + (1.0 - f) * colors[i-1];
		}
	}
	#pragma unroll_loop_end
	return vec3(1.0);
}

vec3 blackbody_extended(float x) {
	const vec3 colors[7] = vec3[7](
		vec3(0.0),
		vec3(0.0/255.0, 24.0/255.0, 168.0/255.0),
		vec3(99.0/255.0, 0.0/255.0, 228.0/255.0),
		vec3(220.0/255.0, 20.0/255.0, 60.0/255.0),
		vec3(255.0/255.0, 117.0/255.0, 56.0/255.0),
		vec3(238.0/255.0, 210.0/255.0, 20.0/255.0),
		vec3(1.0)
	);
	const float thresholds[7] = float[7](
		0.0,
		0.22,
		0.35,
		0.47,
		0.64,
		0.84,
		1.0
	);
	if (x < 0.0) return vec3(0.0);

	#pragma unroll_loop_start 
	for (int i = 1; i < 7; ++i) {
		if (x < thresholds[i]) {
			float f = (x-thresholds[i-1])/(thresholds[i]-thresholds[i-1]);
			return f * colors[i] + (1.0 - f) * colors[i-1];
		}
	}
	#pragma unroll_loop_end
	return vec3(1.0);
}


void main() {
	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mvPosition;

	gl_PointSize = cell_size * size_factor * size / length(mvPosition.xzy/mvPosition.w);

    splat_density = clamp((density-threshold_min)/(threshold_max - threshold_min), 0.0, 1.0);
	splat_size = size;
	splat_color = blackbody_extended(splat_density);
	splat_alpha = clamp(splat_size * pow(splat_density, alpha_exponent), 0.0, 1.0); // alpha based on cell size
	//splat_alpha = clamp(pow(splat_density, alpha_exponent), 0.0, 1.0); // alpha independent of cell size
	gl_Position.w *= float(splat_alpha >= alpha_cutoff); // should get culled before rasterization
}

