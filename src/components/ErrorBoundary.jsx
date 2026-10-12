import { Component } from 'react';
import { reportError } from '../utils/errorLog.js';

// Class component => cannot use hooks, so the fallback is bilingual by construction.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', this.props.name || '', error, info?.componentStack);
    reportError(error, `boundary:${this.props.name || ''}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card error-card" role="alert">
        <h3>משהו השתבש / Something went wrong</h3>
        {this.props.name && <small>{this.props.name}</small>}
        <button className="btn" onClick={() => this.setState({ error: null })}>נסה שוב / Try again</button>
      </div>
    );
  }
}
