import { EffectComposer, Bloom } from "@react-three/postprocessing";

export function View3D() {
  return (
    <>
      <group>
        <Sphere position={[0, 0, 0]} />
        <Sphere position={[100, 0, 0]} />
        <Sphere position={[200, 0, 0]} />
        <Sphere position={[300, 0, 0]} />
        <Sphere position={[400, 0, 0]} />
        <Sphere position={[500, 0, 0]} />
      </group>
      <EffectComposer>
        <Bloom
          intensity={1.5}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
          height={300}
        />
      </EffectComposer>
    </>
  );
}

function Sphere({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[20, 32, 32]} />
      <meshStandardMaterial
        color="white"
        emissive="white"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}
