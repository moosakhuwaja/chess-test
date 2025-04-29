class Backtester:
    def __init__(self, data, initial_balance=1000, leverage=1, fee=0.0004):
        self.data = data
        self.balance = initial_balance
        self.initial_balance = initial_balance
        self.leverage = leverage
        self.fee = fee  # Binance trading fee (0.04%)
        self.equity = []
        self.trades = []
    
    def execute_trade(self, price, direction, size):
        # Simulate trade execution with fees
        cost = size * price
        fee_paid = cost * self.fee
        self.balance -= fee_paid
        
        if direction == 'long':
            pnl = (self.data['Close'].shift(-1) - price)
        else:  # short
            pnl = price - self.data['Close'].shift(-1)
        
        pnl *= size * self.leverage
        self.balance += pnl
        self.equity.append(self.balance)
        
        trade_result = {
            'direction': direction,
            'entry_price': price,
            'exit_price': self.data['Close'].shift(-1).iloc[0],
            'pnl': pnl,
            'balance': self.balance
        }
        self.trades.append(trade_result)
        
        return trade_result
    
    def run_strategy(self, strategy_func):
        for i in range(len(self.data)):
            signal = strategy_func(self.data.iloc[i])  # Your strategy logic
            if signal == 'buy':
                self.execute_trade(self.data['Close'].iloc[i], 'long', 0.01)  # Trade size
            elif signal == 'sell':
                self.execute_trade(self.data['Close'].iloc[i], 'short', 0.01)
        
        return pd.DataFrame(self.trades)
    
    def plot_results(self):
        plt.figure(figsize=(12, 6))
        plt.plot(self.equity, label="Equity Curve")
        plt.title("Strategy Performance")
        plt.xlabel("Trade #")
        plt.ylabel("Balance (USDT)")
        plt.legend()
        plt.grid()
        plt.show()