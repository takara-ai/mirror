export function View3D() {
  return (
    <mesh>
      <sphereGeometry args={[100, 32, 32]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}
