precision highp float;
precision highp sampler3D;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 camera_position;
uniform vec3 camera_direction;
uniform vec3 relative_position;
uniform float threshold_min;
uniform float threshold_max;
uniform float alpha_exponent;
uniform vec3 cube_size;

in vec3 frag_pos;

out vec4 color;

uniform sampler3D map;

vec2 hitBox(vec3 orig, vec3 dir) {
	vec3 box_min = vec3(-0.5 * cube_size);
	vec3 box_max = vec3(0.5 * cube_size);
	vec3 inv_dir = 1.0 / dir;
	vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
	vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
	vec3 tmin = min( tmin_tmp, tmax_tmp );
	vec3 tmax = max( tmin_tmp, tmax_tmp );
	float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
	float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
	return vec2( t0, t1 );
}

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

void main(){
	vec3 view_direction = frag_pos - camera_position;
	vec3 rayDir = normalize(view_direction);
	vec2 bounds = hitBox(-relative_position, rayDir);

	// start ray in front of viewer
	bounds.x = max(bounds.x, 0.0);

	// lower bound > higher bound, so we're not looking at the volume
	if (bounds.x > bounds.y) discard;

	// assume even resolution
	float size = float(textureSize(map, 0).x);

    // use view aligned evenly spaced slices
    float view_dot = dot(camera_direction, rayDir);
    float delta = 1.0 / (size * view_dot);

    // init uv to view ray intersection with cube
	vec3 uv = 0.5 + (-relative_position + bounds.x * rayDir) / cube_size;
	
    rayDir *= delta;
	delta *= cube_size.x;

    // offset uv to next slice
    float diff = fract(dot(uv * size, camera_direction));
    uv += (1.0 - diff) * rayDir;
    bounds.x += (1.0 - diff) * delta;

	// swizzle uv because grid is in z-x-y order
	uv.xyz = uv.zxy;
	rayDir.xyz = rayDir.zxy;

	// safety so we don't get infinite / very long loops
	int count = int(min((bounds.y - bounds.x) / delta, 1000.0));
	vec4 c = vec4(0.0);
	
	for (int i = 0; i < count; ++i) {
		float d = clamp((texture(map, uv).r - threshold_min)/(threshold_max - threshold_min), 0.0, 1.0);
        float alpha = pow(d, alpha_exponent);
		
		c += (1.0 - c.w) * vec4(alpha * blackbody_extended(d), alpha);
		uv += rayDir;
		
	    if (c.w >= 0.99) break;
	}
	color = c;
}
