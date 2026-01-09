# Contributing to SecureRAG

Thank you for your interest in contributing to SecureRAG! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in the [Issues](https://github.com/yourusername/securerag/issues) section
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the issue
   - Expected vs. actual behavior
   - Environment details (OS, Python version, Docker version, etc.)
   - Relevant logs or error messages

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a new issue with:
   - A clear description of the feature
   - Use cases and benefits
   - Potential implementation approach (if you have ideas)

### Pull Requests

1. **Fork the repository** and create a new branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards below

3. **Test your changes**:
   ```bash
   # Backend tests
   cd backend
   pytest tests/
   
   # Frontend (if applicable)
   cd frontend
   npm test
   ```

4. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "Add feature: description of what you did"
   ```

5. **Push to your fork** and create a Pull Request:
   - Provide a clear title and description
   - Reference any related issues
   - Include screenshots for UI changes

## Coding Standards

### Python (Backend)

- Follow PEP 8 style guide
- Use type hints where appropriate
- Write docstrings for all functions and classes
- Keep functions focused and single-purpose
- Add comments for complex logic

### JavaScript/React (Frontend)

- Follow ESLint configuration
- Use functional components with hooks
- Keep components small and focused
- Use meaningful variable and function names
- Add PropTypes or TypeScript types where applicable

### General

- Write clear, self-documenting code
- Add tests for new features
- Update documentation as needed
- Ensure backward compatibility when possible

## Development Setup

1. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/securerag.git
   cd securerag
   ```

2. Set up the development environment:
   ```bash
   # Backend
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   
   # Frontend
   cd ../frontend
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Run the application:
   ```bash
   # Using Docker Compose (recommended)
   docker-compose up --build
   
   # Or run locally
   # Backend: uvicorn app.main:app --reload
   # Frontend: npm start
   ```

## Testing

- Write unit tests for new features
- Ensure all existing tests pass
- Aim for good test coverage
- Test edge cases and error conditions

## Documentation

- Update README.md if adding new features
- Add docstrings to new functions/classes
- Update API documentation if endpoints change
- Include examples in documentation

## Questions?

Feel free to open an issue with the `question` label if you need help or clarification.

Thank you for contributing to SecureRAG! 🎉
