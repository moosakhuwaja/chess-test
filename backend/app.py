from flask import Flask, render_template, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from game_manager import GameManager
import chess
import time

app = Flask(__name__,
            template_folder='../frontend',
            static_folder='../frontend')
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app)

game_manager = GameManager()


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/game/<room_id>')
def game(room_id):
    return render_template('game.html', room_id=room_id)


@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    game_manager.handle_disconnect(request.sid)


@socketio.on('join_room')
def handle_join_room(data):
    room_id = data['room_id']
    role = data.get('role', 'watcher')  # player or watcher
    color = data.get('color', None)  # white or black

    game_state = game_manager.join_room(room_id, request.sid, role, color)
    join_room(room_id)

    emit('game_state', game_state.to_dict(), room=request.sid)
    emit('room_update', game_manager.get_room_info(room_id), room=room_id)


@socketio.on('make_move')
def handle_move(data):
    room_id = data['room_id']
    move = data['move']

    result = game_manager.make_move(room_id, request.sid, move)
    if result['success']:
        emit('move_made', {
            'move': move,
            'fen': result['fen'],
            'status': result['status']
        }, room=room_id)
    else:
        emit('move_error', {'message': result['message']}, room=request.sid)


@socketio.on('resign')
def handle_resign(data):
    room_id = data['room_id']
    result = game_manager.resign(room_id, request.sid)
    emit('game_ended', result, room=room_id)


@socketio.on('offer_draw')
def handle_draw_offer(data):
    room_id = data['room_id']
    result = game_manager.offer_draw(room_id, request.sid)
    emit('draw_offered', result, room=room_id)


@socketio.on('accept_draw')
def handle_accept_draw(data):
    room_id = data['room_id']
    result = game_manager.accept_draw(room_id, request.sid)
    emit('game_ended', result, room=room_id)


@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)


if __name__ == '__main__':
    socketio.run(app, debug=True)
