import { map } from 'ramda'

import { parseBasicRoom, parseUser } from './parsers'

export class UserSubscription {
  constructor (options) {
    this.userId = options.userId
    this.hooks = options.hooks
    this.instance = options.instance
    this.userStore = options.userStore
    this.roomStore = options.roomStore
    this.typingIndicators = options.typingIndicators
  }

  connect () {
    return new Promise((resolve, reject) => {
      this.hooks = { ...this.hooks, subscriptionEstablished: resolve }
      this.instance.subscribeNonResuming({
        path: '/users',
        listeners: {
          onError: reject,
          onEvent: this.onEvent
        }
      })
    })
  }

  onEvent = ({ body }) => {
    switch (body.event_name) {
      case 'initial_state':
        this.onInitialState(body.data)
        break
      case 'added_to_room':
        this.onAddedToRoom(body.data)
        break
      case 'removed_from_room':
        this.onRemovedFromRoom(body.data)
        break
      // case 'user_joined':
      //   break
      case 'user_left':
        this.onUserLeft(body.data)
        break
      case 'typing_start': // TODO 'is_typing'
        this.onTypingStart(body.data)
        break
    }
  }

  onInitialState = ({ current_user: userData, rooms: roomsData }) => {
    this.hooks.subscriptionEstablished({
      user: parseUser(userData),
      basicRooms: map(parseBasicRoom, roomsData)
    })
  }

  onAddedToRoom = ({ room: roomData }) => {
    // TODO fetch new user details in bulk when added to room (etc)
    const basicRoom = parseBasicRoom(roomData)
    this.roomStore.set(basicRoom.id, basicRoom).then(room => {
      if (this.hooks.addedToRoom) {
        this.hooks.addedToRoom(room)
      }
    })
  }

  onRemovedFromRoom = ({ room_id: roomId }) => {
    this.roomStore.pop(roomId).then(room => {
      if (this.hooks.removedFromRoom) {
        this.hooks.removedFromRoom(room)
      }
    })
  }

  onUserLeft = ({ room_id: roomId, user_id: userId }) => {
    this.roomStore.removeUserFromRoom(roomId, userId)
    if (this.hooks.userLeftRoom) {
      Promise.all([this.roomStore.get(roomId), this.userStore.get(userId)])
        .then(([r, u]) => this.hooks.userLeftRoom(r, u))
    }
  }

  onTypingStart = ({ room_id: roomId, user_id: userId }) => {
    Promise.all([this.roomStore.get(roomId), this.userStore.get(userId)])
      .then(([r, u]) => this.typingIndicators.onIsTyping(r, u, this.hooks))
  }
}
