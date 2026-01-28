import { profanityFilterService } from '../profanity-filter.service';

describe('ProfanityFilterService', () => {
  describe('validateNickname', () => {
    describe('length validation', () => {
      it('should reject empty nickname', () => {
        const result = profanityFilterService.validateNickname('');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname is required');
      });

      it('should reject nickname with only whitespace', () => {
        const result = profanityFilterService.validateNickname('   ');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname is required');
      });

      it('should reject nickname with 1 character', () => {
        const result = profanityFilterService.validateNickname('a');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname must be at least 2 characters long');
      });

      it('should accept nickname with 2 characters', () => {
        const result = profanityFilterService.validateNickname('ab');
        expect(result.isValid).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should accept nickname with 20 characters', () => {
        const result = profanityFilterService.validateNickname('12345678901234567890');
        expect(result.isValid).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should reject nickname with 21 characters', () => {
        const result = profanityFilterService.validateNickname('123456789012345678901');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname must be no more than 20 characters long');
      });

      it('should trim whitespace before validating length', () => {
        const result = profanityFilterService.validateNickname('  ab  ');
        expect(result.isValid).toBe(true);
      });
    });

    describe('null/undefined validation', () => {
      it('should reject null nickname', () => {
        const result = profanityFilterService.validateNickname(null as any);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname is required');
      });

      it('should reject undefined nickname', () => {
        const result = profanityFilterService.validateNickname(undefined as any);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname is required');
      });

      it('should reject non-string nickname', () => {
        const result = profanityFilterService.validateNickname(123 as any);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname is required');
      });
    });

    describe('profanity detection', () => {
      it('should accept clean nicknames', () => {
        const cleanNicknames = [
          'Alice',
          'Bob123',
          'CoolPlayer',
          'QuizMaster',
          'Player1',
          'TeamRocket',
          'StarGazer',
          'MoonWalker'
        ];

        cleanNicknames.forEach(nickname => {
          const result = profanityFilterService.validateNickname(nickname);
          expect(result.isValid).toBe(true);
          expect(result.reason).toBeUndefined();
        });
      });

      it('should reject nicknames with profanity', () => {
        // Note: Using mild examples that bad-words library catches
        const profaneNicknames = [
          'damn',
          'hell',
          'crap'
        ];

        profaneNicknames.forEach(nickname => {
          const result = profanityFilterService.validateNickname(nickname);
          expect(result.isValid).toBe(false);
          expect(result.reason).toBe('Nickname contains inappropriate content');
        });
      });
    });

    describe('leetspeak normalization', () => {
      it('should normalize 0 to o', () => {
        // If "cool" is not profane, "c00l" should also pass
        const result = profanityFilterService.validateNickname('c00l');
        expect(result.isValid).toBe(true);
      });

      it('should normalize 1 to i', () => {
        const result = profanityFilterService.validateNickname('n1ce');
        expect(result.isValid).toBe(true);
      });

      it('should normalize 3 to e', () => {
        const result = profanityFilterService.validateNickname('l33t');
        expect(result.isValid).toBe(true);
      });

      it('should normalize 4 to a', () => {
        const result = profanityFilterService.validateNickname('g4mer');
        expect(result.isValid).toBe(true);
      });

      it('should normalize 5 to s', () => {
        const result = profanityFilterService.validateNickname('5tar');
        expect(result.isValid).toBe(true);
      });

      it('should normalize 7 to t', () => {
        const result = profanityFilterService.validateNickname('7est');
        expect(result.isValid).toBe(true);
      });

      it('should normalize multiple leetspeak characters', () => {
        const result = profanityFilterService.validateNickname('h3ll0w0rld');
        // "helloworld" is clean, so this should pass
        expect(result.isValid).toBe(true);
      });

      it('should catch obfuscated profanity with leetspeak', () => {
        // Create a custom test with a word we add to the filter
        profanityFilterService.addCustomWords('badword');
        
        // Test that leetspeak version is caught
        const result = profanityFilterService.validateNickname('b4dw0rd');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname contains inappropriate content');
        
        // Clean up
        profanityFilterService.removeWords('badword');
      });
    });

    describe('edge cases', () => {
      it('should handle nicknames with special characters', () => {
        const result = profanityFilterService.validateNickname('Player_123');
        expect(result.isValid).toBe(true);
      });

      it('should handle nicknames with spaces', () => {
        const result = profanityFilterService.validateNickname('Cool Player');
        expect(result.isValid).toBe(true);
      });

      it('should handle nicknames with mixed case', () => {
        const result = profanityFilterService.validateNickname('CoOlPlAyEr');
        expect(result.isValid).toBe(true);
      });

      it('should handle nicknames with emojis (if within length)', () => {
        const result = profanityFilterService.validateNickname('Player😀');
        // Emojis count as characters, so this should be valid if length is ok
        expect(result.isValid).toBe(true);
      });

      it('should handle nicknames with unicode characters', () => {
        const result = profanityFilterService.validateNickname('Jöhn');
        expect(result.isValid).toBe(true);
      });
    });

    describe('custom word management', () => {
      it('should allow adding custom words to filter', () => {
        profanityFilterService.addCustomWords('testbadword');
        
        const result = profanityFilterService.validateNickname('testbadword');
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Nickname contains inappropriate content');
        
        // Clean up
        profanityFilterService.removeWords('testbadword');
      });

      it('should allow removing words from filter', () => {
        // Add a word
        profanityFilterService.addCustomWords('okword');
        
        // Verify it's blocked
        let result = profanityFilterService.validateNickname('okword');
        expect(result.isValid).toBe(false);
        
        // Remove it
        profanityFilterService.removeWords('okword');
        
        // Verify it's now allowed
        result = profanityFilterService.validateNickname('okword');
        expect(result.isValid).toBe(true);
      });

      it('should allow adding multiple custom words at once', () => {
        profanityFilterService.addCustomWords('word1', 'word2', 'word3');
        
        expect(profanityFilterService.validateNickname('word1').isValid).toBe(false);
        expect(profanityFilterService.validateNickname('word2').isValid).toBe(false);
        expect(profanityFilterService.validateNickname('word3').isValid).toBe(false);
        
        // Clean up
        profanityFilterService.removeWords('word1', 'word2', 'word3');
      });
    });

    describe('real-world scenarios', () => {
      it('should accept common gaming nicknames', () => {
        const gamingNicknames = [
          'xXProGamerXx',
          'NoobMaster69',
          'DragonSlayer',
          'ShadowNinja',
          'IceQueen',
          'FireStorm',
          'ThunderBolt',
          'MysticMage'
        ];

        gamingNicknames.forEach(nickname => {
          const result = profanityFilterService.validateNickname(nickname);
          expect(result.isValid).toBe(true);
        });
      });

      it('should accept names with numbers', () => {
        const result = profanityFilterService.validateNickname('Player123');
        expect(result.isValid).toBe(true);
      });

      it('should handle minimum valid length edge case', () => {
        const result = profanityFilterService.validateNickname('AB');
        expect(result.isValid).toBe(true);
      });

      it('should handle maximum valid length edge case', () => {
        const result = profanityFilterService.validateNickname('A'.repeat(20));
        expect(result.isValid).toBe(true);
      });
    });
  });
});
