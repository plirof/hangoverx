function DynamicObject(map, type, x, y) {
    /* private variables */

    var __x = x;
    var __y = y;
    var __type = type;
    var __definition = map._getObjectDefinition(type);
    var __inventory = [];
    var __destroyed = false;
    var __myTurn = true;
    var __timer = null;

    /* unexposed methods */

    this._isDestroyed = function () { return __destroyed; };

    this._computeDestination = function (startX, startY, direction) {
        switch (direction) {
            case 'up':
                return {'x': startX, 'y': startY - 1};
            case 'down':
                return {'x': startX, 'y': startY + 1};
            case 'left':
                return {'x': startX - 1, 'y': startY};
            case 'right':
                return {'x': startX + 1, 'y': startY};
        }
    };

    this._onTurn = function () {
        var me = this;
        var player = map.getPlayer();

        function executeTurn() {
            __myTurn = true;

            try {
                //we need to check for a collision with the player *after*
                //the player has moved but *before* the object itself moves
                //this prevents a bug where players and objects can 'pass through'
                //each other
                if (__x === player.getX() && __y === player.getY()) {
                    if (__definition.onCollision) {
                        map._validateCallback(function () {
                            __definition.onCollision(player, me);
                        });
                    }
                }

                if (__definition.behavior !== null) {
                    map._validateCallback(function () {
                        __definition.behavior(me, player);
                    });
                }
            } catch (e) {
                map.writeStatus(e.toString());
            }
        }

        if (__definition.interval) {
            // start timer if not already set
            if (!__timer) {
                __timer = setInterval(executeTurn, __definition.interval);
            }

            // don't move on regular turn, but still check for player collision
            if (map.getPlayer().atLocation(__x, __y) &&
                    (__definition.onCollision || __definition.projectile)) {
                // trigger collision
                if (__definition.projectile) {
                    // projectiles automatically kill
                    map.getPlayer().killedBy('a ' + __type);
                } else {
                    map._validateCallback(function () {
                        __definition.onCollision(map.getPlayer(), this);
                    });
                }
            }
        } else {
            executeTurn();
        }
    };

    this._afterMove = function () {
        // try to pick up items
        var objectName = map._getGrid()[__x][__y].type;
        var object = map._getObjectDefinition(objectName);
        if (object.type === 'item' && !__definition.projectile) {
            __inventory.push(objectName);
            map._removeItemFromMap(__x, __y, objectName);
            map._playSound('pickup');
        } else if (object.type === 'trap') {
            if (object.deactivatedBy && object.deactivatedBy.indexOf(__type) > -1) {
                if (typeof(object.onDeactivate) === 'function') {
                    object.onDeactivate();
                }
                map._removeItemFromMap(__x, __y, objectName);
            }
        }
    };

    this._map = map;

    this._destroy = function (onMapReset) {
        var me = this;

        __destroyed = true;
        clearInterval(__timer);

        // remove this object from map's __dynamicObjects list
        map._refreshDynamicObjects();

        // unless the map is being reset, play an explosion
        // and call this object's onDestroy method
        if (__definition.onDestroy && !onMapReset) {
            if (!__definition.projectile) {
                map._playSound('explosion');
            }

            map._validateCallback(function () {
                __definition.onDestroy(me);
            });
        }
    };

    /* exposed methods */

    this.getX = function () { return __x; };
    this.getY = function () { return __y; };
    this.getType = function () { return __type; };

    this.giveItemTo = function (player, itemType) {
        var pl_at = player.atLocation;

        if (!(pl_at(__x, __y) || pl_at(__x+1, __y) || pl_at(__x-1, __y) ||
                pl_at(__x, __y+1) || pl_at(__x, __y-1))) {
            throw (type + ' says: Can\'t give an item unless I\'m touching the player!');
        }
        if (__inventory.indexOf(itemType) < 0) {
            throw (type + ' says: I don\'t have that item!');
        }

        player._pickUpItem(itemType, map._getObjectDefinition(itemType));
    };

    this.move = function (direction) {
        var dest = this._computeDestination(__x, __y, direction);

        if (!__myTurn) {
            throw 'Can\'t move when it isn\'t your turn!';
        }

        var nearestObj = map._findNearestToPoint("anyDynamic", dest.x, dest.y);

        // check for collision with player
        if (map.getPlayer().atLocation(dest.x, dest.y) &&
                (__definition.onCollision || __definition.projectile)) {
            // trigger collision
            if (__definition.projectile) {
                // projectiles automatically kill
                map.getPlayer().killedBy('a ' + __type);
            } else {
                __definition.onCollision(map.getPlayer(), this);
            }
        } else if (map._canMoveTo(dest.x, dest.y, __type) &&
                !map._isPointOccupiedByDynamicObject(dest.x, dest.y)) {
            // move the object
            __x = dest.x;
            __y = dest.y;
            this._afterMove(__x, __y);
        } else {
            // cannot move
            if (__definition.projectile) {
                // projectiles disappear when they cannot move
                this._destroy();

                // projectiles also destroy any dynamic objects they touch
                if (map._isPointOccupiedByDynamicObject(dest.x, dest.y)) {
                    map._findDynamicObjectAtPoint(dest.x, dest.y)._destroy();
                }
            }
        }

        __myTurn = false;
    };

    this.canMove = function (direction) {
        var dest = this._computeDestination(__x, __y, direction);

        // check if the object can move there and will not collide with a copy of itself
        return (map._canMoveTo(dest.x, dest.y, __type) &&
            !(dest.x === this.findNearest(__type).x && dest.y === this.findNearest(__type).y));
    };

    this.findNearest = function (type) {
        return map._findNearestToPoint(type, __x, __y);
    };

    // only for teleporters
    this.setTarget = function (target) {
        if (__type != 'teleporter') {
            throw 'setTarget() can only be called on a teleporter!';
        }

        if (target === this) {
            throw 'Teleporters cannot target themselves!';
        }

        this.target = target;
    };

    // constructor

    if (!map._dummy && __definition.interval) {
        this._onTurn();
    }
}
