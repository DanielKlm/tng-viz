in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 frag_pos;

void main() {
	vec4 mvp = modelViewMatrix * vec4( position, 1.0 );

	frag_pos = (modelMatrix * vec4(position.xyz, 1.0)).xyz;

	gl_Position = projectionMatrix * mvp;
}

