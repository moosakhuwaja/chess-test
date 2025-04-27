import chess
import chess.pgn
from datetime import datetime
import time


class GameState:
    def __init__(self, fen=chess.STARTING_FEN):
        self.board = chess.Board(fen)
        self.white_player = None
        self.black_player = None
        self.watchers = set()
        self.status = "ongoing"  # ongoing, checkmate, stalemate, draw, resigned
        self.result = None
        self.last_move_time = time.time()
        self.draw_offered_by = None
        self.move_history = []

    def to_dict(self):
        return {
            'fen': self.board.fen(),
            'status': self.status,
            'result': self.result,
            'white_player': self.white_player,
            'black_player': self.black_player,
            'watchers': list(self.watchers),
            'turn': 'white' if self.board.turn else 'black',
            'draw_offered': self.draw_offered_by,
            'move_history': self.move_history
        }


class GameManager:
    def __init__(self):
        self.rooms = {}  # room_id: GameState
        self.player_rooms = {}  # player_sid: room_id
        self.live_games = []
        self.ended_games = []
        self.all_games = []

    def join_room(self, room_id, player_sid, role, color=None):
        if room_id not in self.rooms:
            self.rooms[room_id] = GameState()
            self.live_games.append(room_id)

        game_state = self.rooms[room_id]

        # Check if room already has 2 players
        if game_state.white_player and game_state.black_player:
            # Force join as watcher if room is full
            role = 'watcher'

        if role == 'player':
            if color == 'random':
                color = 'white' if game_state.white_player is None else 'black'

            if color == 'white' and game_state.white_player is None:
                game_state.white_player = player_sid
            elif color == 'black' and game_state.black_player is None:
                game_state.black_player = player_sid
            else:
                # If requested color is taken or room is full, assign as watcher
                role = 'watcher'

        if role == 'watcher':
            game_state.watchers.add(player_sid)

        self.player_rooms[player_sid] = room_id
        return game_state

    def make_move(self, room_id, player_sid, move):
        if room_id not in self.rooms:
            return {'success': False, 'message': 'Room does not exist'}

        game_state = self.rooms[room_id]

        # Check if player is allowed to move
        if (game_state.board.turn == chess.WHITE and player_sid != game_state.white_player) or \
           (game_state.board.turn == chess.BLACK and player_sid != game_state.black_player):
            return {'success': False, 'message': 'Not your turn'}

        try:
            chess_move = game_state.board.parse_san(move)
        except chess.IllegalMoveError:
            return {'success': False, 'message': 'Illegal move'}
        except chess.InvalidMoveError:
            return {'success': False, 'message': 'Invalid move'}

        if chess_move not in game_state.board.legal_moves:
            return {'success': False, 'message': 'Illegal move'}

        game_state.board.push(chess_move)
        game_state.last_move_time = time.time()
        game_state.move_history.append(move)

        status = "ongoing"
        if game_state.board.is_checkmate():
            status = "checkmate"
            game_state.result = "white" if game_state.board.turn == chess.BLACK else "black"
            self._end_game(room_id)
        elif game_state.board.is_stalemate():
            status = "stalemate"
            game_state.result = "draw"
            self._end_game(room_id)
        elif game_state.board.is_insufficient_material():
            status = "draw"
            game_state.result = "draw"
            self._end_game(room_id)

        game_state.status = status

        return {
            'success': True,
            'fen': game_state.board.fen(),
            'status': status,
            'result': game_state.result
        }

    def resign(self, room_id, player_sid):
        if room_id not in self.rooms:
            return {'success': False, 'message': 'Room does not exist'}

        game_state = self.rooms[room_id]

        if player_sid == game_state.white_player:
            game_state.result = "black"
        elif player_sid == game_state.black_player:
            game_state.result = "white"
        else:
            return {'success': False, 'message': 'You are not a player'}

        game_state.status = "resigned"
        return self._end_game(room_id)

    def offer_draw(self, room_id, player_sid):
        if room_id not in self.rooms:
            return {'success': False, 'message': 'Room does not exist'}

        game_state = self.rooms[room_id]

        if player_sid not in [game_state.white_player, game_state.black_player]:
            return {'success': False, 'message': 'Only players can offer draws'}

        game_state.draw_offered_by = player_sid
        return {'success': True, 'offered_by': player_sid}

    def accept_draw(self, room_id, player_sid):
        if room_id not in self.rooms:
            return {'success': False, 'message': 'Room does not exist'}

        game_state = self.rooms[room_id]

        if game_state.draw_offered_by is None:
            return {'success': False, 'message': 'No draw offer to accept'}

        if player_sid == game_state.draw_offered_by:
            return {'success': False, 'message': 'Cannot accept your own draw offer'}

        if player_sid not in [game_state.white_player, game_state.black_player]:
            return {'success': False, 'message': 'Only players can accept draws'}

        game_state.result = "draw"
        game_state.status = "draw"
        return self._end_game(room_id)

    def _end_game(self, room_id):
        game_state = self.rooms[room_id]

        # Move from live games to ended games
        if room_id in self.live_games:
            self.live_games.remove(room_id)

        game_info = {
            'room_id': room_id,
            'white': game_state.white_player,
            'black': game_state.black_player,
            'result': game_state.result,
            'status': game_state.status,
            'end_time': datetime.now().isoformat(),
            'move_count': len(game_state.move_history)
        }

        self.ended_games.append(game_info)
        self.all_games.append(game_info)
        return game_info

    def handle_disconnect(self, player_sid):
        if player_sid not in self.player_rooms:
            return

        room_id = self.player_rooms[player_sid]
        if room_id not in self.rooms:
            return

        game_state = self.rooms[room_id]

        # Remove from watchers
        if player_sid in game_state.watchers:
            game_state.watchers.remove(player_sid)

        # Handle player disconnect
        if player_sid == game_state.white_player:
            game_state.white_player = None
        elif player_sid == game_state.black_player:
            game_state.black_player = None

        # Check if both players left
        if game_state.white_player is None and game_state.black_player is None:
            # Room will be empty, we can clean it up after a timeout
            pass

        del self.player_rooms[player_sid]

    def get_room_info(self, room_id):
        if room_id not in self.rooms:
            return None

        game_state = self.rooms[room_id]
        return game_state.to_dict()

    def get_all_games(self):
        return {
            'live_games': self.live_games,
            'ended_games': self.ended_games,
            'all_games': self.all_games
        }
