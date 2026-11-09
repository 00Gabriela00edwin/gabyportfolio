import { useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, CuboidCollider, Physics, RigidBody } from '@react-three/rapier';

function WalkerCollider({ initialPosition, positionRef }) {
  const body = useRef(null);

  useFrame(() => {
    if (!body.current) return;
    const { x, y, z } = positionRef.current;
    body.current.setNextKinematicTranslation({ x, y: y + 0.95, z });
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      position={[initialPosition[0], initialPosition[1] + 0.95, initialPosition[2]]}
      colliders={false}
      userData={{ role: 'walker' }}
    >
      <CapsuleCollider args={[0.62, 0.3]} />
    </RigidBody>
  );
}

function TrailLetter({ character, position, rotationY, onWalkerCollision }) {
  const [x, groundHeight, z] = position;

  return (
    <>
      <RigidBody
        type="fixed"
        position={[x, groundHeight - 0.08, z]}
        colliders={false}
      >
        <CuboidCollider args={[0.48, 0.08, 0.58]} friction={0.9} />
      </RigidBody>
      <RigidBody
        type="dynamic"
        position={[x, groundHeight + 0.74, z]}
        rotation={[0, rotationY, 0]}
        colliders={false}
        linearDamping={0.18}
        angularDamping={0.24}
        canSleep
        onCollisionEnter={({ other }) => {
          if (other.rigidBodyObject.userData?.role === 'walker') onWalkerCollision();
        }}
      >
        <CuboidCollider
          args={[0.36, 0.72, 0.2]}
          friction={0.82}
          restitution={0.08}
        />
        <Text
          position={[0, -0.7, -0.1]}
          fontSize={1.45}
          color="#7b422d"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.035}
          outlineColor="#553324"
          material-toneMapped={false}
        >
          {character}
        </Text>
        <Text
          position={[0, -0.7, 0.1]}
          fontSize={1.45}
          color="#f9f1d1"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.035}
          outlineColor="#7b422d"
          material-toneMapped={false}
        >
          {character}
        </Text>
      </RigidBody>
    </>
  );
}

export default function TrailPhysics({
  initialPosition,
  letters,
  positionRef,
  onWalkerCollision,
}) {
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
      <WalkerCollider initialPosition={initialPosition} positionRef={positionRef} />
      {letters.map(({ character, key, position, rotationY }) => (
        <TrailLetter
          key={key}
          character={character}
          position={position}
          rotationY={rotationY}
          onWalkerCollision={onWalkerCollision}
        />
      ))}
    </Physics>
  );
}
