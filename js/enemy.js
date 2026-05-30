'use strict';

// Enemy AI – States: PATROL → INVESTIGATE → CHASE → ATTACK
const EnemyState = { PATROL: 0, INVESTIGATE: 1, CHASE: 2, ATTACK: 3 };

class Enemy {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;

    this.mesh = null;
    this._eyeLight = null;

    this.state = EnemyState.PATROL;
    this.position = new THREE.Vector3(24, 0, 0);
    this.waypoints = [];
    this._wpIndex = 0;
    this._wpTimer = 0;

    this._targetPos = new THREE.Vector3();
    this._lastSeenPlayer = new THREE.Vector3();
    this._lostTimer = 0;
    this._attackCooldown = 0;
    this._stateTimer = 0;

    // Speeds
    this.PATROL_SPEED   = 1.8;
    this.INVESTIGATE_SPEED = 2.4;
    this.CHASE_SPEED    = 3.4;

    // Detection
    this.VIEW_DIST      = 10;
    this.CLOSE_DIST     = 3.5;
    this.ATTACK_DIST    = 1.6;
    this.CHASE_LOSE_DIST = 14;

    this._visible = true;
  }

  initialize(waypoints) {
    this.waypoints = waypoints;
    this._buildMesh();
  }

  reset() {
    this.state = EnemyState.PATROL;
    this.position.set(24, 0, 0);
    if (this.mesh) this.mesh.position.copy(this.position).setY(0);
    this._wpIndex = 0;
    this._lostTimer = 0;
    this._attackCooldown = 0;
    this._stateTimer = 0;
    this._visible = true;
    if (this.mesh) this.mesh.visible = true;
  }

  // ── Build visual ─────────────────────────────────────────────────

  _buildMesh() {
    const group = new THREE.Group();

    // Torso
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.0, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x050505, emissive: 0x0a0808, emissiveIntensity: 0.1 })
    );
    body.position.y = 1.2;
    group.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x080505, emissive: 0x100808, emissiveIntensity: 0.15 })
    );
    head.position.y = 1.9;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.9, 0.18);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x040404 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, 0.45, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.15, 0.45, 0);
    group.add(legR);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.14, 0.8, 0.14);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x050505 });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.35, 1.2, 0);
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.35, 1.2, 0);
    group.add(armR);

    // Glowing eye sockets (subtle)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x800000 });
    const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eye1.position.set(-0.07, 1.93, 0.17);
    group.add(eye1);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eye2.position.set(0.07, 1.93, 0.17);
    group.add(eye2);

    group.position.copy(this.position);
    this.scene.add(group);
    this.mesh = group;

    // Dim red point light (subtle, follows enemy)
    this._eyeLight = new THREE.PointLight(0x600000, 0, 3);
    this._eyeLight.position.set(0, 1.9, 0);
    group.add(this._eyeLight);
  }

  // ── Main update ───────────────────────────────────────────────────

  update(delta, playerPos, playerDir) {
    if (!this.mesh) return;
    this._stateTimer += delta;
    if (this._attackCooldown > 0) this._attackCooldown -= delta;

    const distToPlayer = this.getDistanceToPlayer(playerPos);
    const canSee = this._canSeePlayer(playerPos);

    switch (this.state) {
      case EnemyState.PATROL:
        this._doPatrol(delta);
        if (canSee || distToPlayer < this.CLOSE_DIST) {
          this._enterChase(playerPos);
        }
        break;

      case EnemyState.INVESTIGATE:
        this._doInvestigate(delta, playerPos);
        if (canSee || distToPlayer < this.CLOSE_DIST) {
          this._enterChase(playerPos);
        }
        break;

      case EnemyState.CHASE:
        this._doChase(delta, playerPos);
        if (distToPlayer < this.ATTACK_DIST && this._attackCooldown <= 0) {
          this._enterAttack();
        }
        if (!canSee && distToPlayer > this.CHASE_LOSE_DIST) {
          this._lostTimer += delta;
          if (this._lostTimer > 4) {
            this._enterInvestigate(this._lastSeenPlayer.clone());
          }
        } else {
          this._lostTimer = 0;
          if (canSee) this._lastSeenPlayer.copy(playerPos);
        }
        break;

      case EnemyState.ATTACK:
        // Trigger handled in game.js; after brief pause return to chase
        if (this._stateTimer > 0.5) this._enterChase(playerPos);
        break;
    }

    // Eye glow intensifies when chasing
    if (this._eyeLight) {
      const targetIntensity = this.state >= EnemyState.CHASE ? 0.6 : 0;
      this._eyeLight.intensity += (targetIntensity - this._eyeLight.intensity) * delta * 3;
    }

    // Leg bob animation
    this._animateLegs(delta);
  }

  _doPatrol(delta) {
    if (!this.waypoints.length) return;
    const wp = this.waypoints[this._wpIndex];
    const dx = wp.x - this.position.x;
    const dz = wp.z - this.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    if (dist < 0.5) {
      this._wpTimer += delta;
      if (this._wpTimer > 1.5) {
        this._wpTimer = 0;
        this._wpIndex = (this._wpIndex + 1) % this.waypoints.length;
      }
      return;
    }
    this._wpTimer = 0;
    const speed = this.PATROL_SPEED;
    this.position.x += (dx/dist) * speed * delta;
    this.position.z += (dz/dist) * speed * delta;
    this._updateMeshPos();
    this._faceDirection(dx, dz);
  }

  _doInvestigate(delta, playerPos) {
    const dx = this._targetPos.x - this.position.x;
    const dz = this._targetPos.z - this.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.8 || this._stateTimer > 8) {
      this._enterPatrol();
      return;
    }
    const speed = this.INVESTIGATE_SPEED;
    this.position.x += (dx/dist) * speed * delta;
    this.position.z += (dz/dist) * speed * delta;
    this._updateMeshPos();
    this._faceDirection(dx, dz);
  }

  _doChase(delta, playerPos) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.1) return;
    const speed = this.CHASE_SPEED;
    this.position.x += (dx/dist) * speed * delta;
    this.position.z += (dz/dist) * speed * delta;
    this._updateMeshPos();
    this._faceDirection(dx, dz);
  }

  _canSeePlayer(playerPos) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > this.VIEW_DIST) return false;

    // Simple room-based LOS: check if enemy and player are in connected areas
    // Use raycasting against scene walls
    const origin = this.position.clone().setY(1.7);
    const dir = new THREE.Vector3(dx, 0, dz).normalize();
    const ray = new THREE.Raycaster(origin, dir, 0, dist - 0.5);
    const hits = ray.intersectObjects(this.scene.children, false);
    // If a wall is hit before player, line of sight is blocked
    for (const hit of hits) {
      const u = hit.object.userData;
      if (u && (u.type === 'note' || u.type === 'battery' || u.type === 'fuse' || u.interactable)) continue;
      if (hit.object === this.mesh) continue;
      // It's a wall – blocked
      return false;
    }
    return true;
  }

  _enterPatrol() {
    this.state = EnemyState.PATROL;
    this._stateTimer = 0;
  }

  _enterInvestigate(pos) {
    this.state = EnemyState.INVESTIGATE;
    this._targetPos.copy(pos);
    this._stateTimer = 0;
    this._lostTimer = 0;
  }

  _enterChase(playerPos) {
    this.state = EnemyState.CHASE;
    this._lastSeenPlayer.copy(playerPos);
    this._lostTimer = 0;
    this._stateTimer = 0;
  }

  _enterAttack() {
    this.state = EnemyState.ATTACK;
    this._stateTimer = 0;
    this._attackCooldown = 2.0;
  }

  isAttacking() {
    return this.state === EnemyState.ATTACK;
  }

  getDistanceToPlayer(playerPos) {
    return this.position.distanceTo(playerPos);
  }

  _updateMeshPos() {
    if (this.mesh) {
      this.mesh.position.x = this.position.x;
      this.mesh.position.z = this.position.z;
    }
  }

  _faceDirection(dx, dz) {
    if (this.mesh) {
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  _animateLegs(delta) {
    if (!this.mesh) return;
    const speed = this.state === EnemyState.CHASE ? 8 : 3;
    const amp = this.state === EnemyState.CHASE ? 0.4 : 0.2;
    const t = performance.now() * 0.001 * speed;
    const legs = this.mesh.children.filter(c => c.position.y < 1);
    if (legs.length >= 2) {
      legs[0].rotation.x =  Math.sin(t) * amp;
      legs[1].rotation.x = -Math.sin(t) * amp;
    }
  }
}
