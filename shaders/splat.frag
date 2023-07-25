precision highp float;

in vec3 splat_color;
in float splat_density;
in float splat_size;
in float splat_alpha;

out vec4 color;

const float PI = 3.1415926;
const float FACTOR = 9.0;

void main(){
    vec2 circ_coord = 2.0 * gl_PointCoord - 1.0;
    // alpha *= 1.0 - length(circ_coord) >= 0.0 ? 1.0 : 0.0; // constant circle
    // alpha = 1.0 - length(circ_coord) >= 0.0 ? 1.0 : 0.0; // constant circle
    //alpha *= 1.0 - length(circ_coord); // fading circle
	float x = dot(circ_coord, circ_coord);
	color.w = splat_alpha * sqrt(FACTOR / PI) * exp(-FACTOR * x); // gauss kernel
	// color.w = splat_alpha * (1.0 - length(circ_coord)); // linear fallof
	color.xyz = splat_color;
}
